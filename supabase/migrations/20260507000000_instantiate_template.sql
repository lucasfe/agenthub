-- RPC: instantiate_template(p_template_id, p_params) returns uuid
--
-- Renders title/description from the template's title_template and
-- description_template (Mustache-style {{params.X}} placeholders),
-- deep-copies plan into a fresh tasks row with all step outputs/statuses
-- reset to pending, and returns the new task id.
--
-- Validation runs server-side too — the modal pre-validates client-side,
-- but if the form is bypassed the RPC raises a structured error that the
-- frontend wrapper surfaces as TemplateInstantiationError.
--
-- Mustache renderer is intentionally minimal: only `{{params.<key>}}`
-- placeholders are recognised here. Step-output and reference placeholders
-- belong to the chat executor's runtime renderer, not to instantiation.

create or replace function render_params_template(p_template text, p_params jsonb)
returns text
language plpgsql
immutable
as $$
declare
  result text := coalesce(p_template, '');
  match_record record;
  param_value text;
begin
  if result = '' then
    return result;
  end if;
  for match_record in
    select distinct (regexp_matches(
      result,
      '\{\{\s*params\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}',
      'g'
    ))[1] as key
  loop
    if p_params ? match_record.key then
      param_value := coalesce(p_params ->> match_record.key, '');
    else
      param_value := '';
    end if;
    result := regexp_replace(
      result,
      '\{\{\s*params\.' || match_record.key || '\s*\}\}',
      param_value,
      'g'
    );
  end loop;
  return result;
end;
$$;

revoke all on function render_params_template(text, jsonb) from public;
grant execute on function render_params_template(text, jsonb) to anon, authenticated;

-- Reset every step output / status inside a plan jsonb so an instantiated
-- task starts fresh. Returns the original plan unchanged when it is null
-- or has no steps array.
create or replace function reset_plan_for_instance(p_plan jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  steps jsonb;
  new_steps jsonb := '[]'::jsonb;
  step jsonb;
begin
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    return p_plan;
  end if;
  steps := p_plan -> 'steps';
  if steps is null or jsonb_typeof(steps) <> 'array' then
    return p_plan;
  end if;
  for step in select * from jsonb_array_elements(steps)
  loop
    step := step
      - 'output'
      - 'output_files'
      - 'error_message'
      - 'started_at'
      - 'completed_at';
    step := jsonb_set(step, '{status}', '"pending"'::jsonb, true);
    new_steps := new_steps || jsonb_build_array(step);
  end loop;
  return jsonb_set(p_plan, '{steps}', new_steps, true);
end;
$$;

revoke all on function reset_plan_for_instance(jsonb) from public;
grant execute on function reset_plan_for_instance(jsonb) to anon, authenticated;

-- Validate p_params against the template's params_schema. Raises an
-- exception with a user-readable message on the first violation.
-- Supports both shapes accepted by the frontend `extractFields`:
--   * JSON-Schema-ish:  { properties: { k: { type, enum, required } }, required: [...] }
--   * Flat-map:         { k: { type, enum, required } }
create or replace function validate_template_params(p_schema jsonb, p_params jsonb)
returns void
language plpgsql
immutable
as $$
declare
  entries jsonb;
  required_set jsonb;
  k text;
  descriptor jsonb;
  enum_values jsonb;
  declared_type text;
  raw_value text;
  is_required boolean;
begin
  if p_schema is null or jsonb_typeof(p_schema) <> 'object' then
    return;
  end if;

  if p_schema ? 'properties' and jsonb_typeof(p_schema -> 'properties') = 'object' then
    entries := p_schema -> 'properties';
    if p_schema ? 'required' and jsonb_typeof(p_schema -> 'required') = 'array' then
      required_set := p_schema -> 'required';
    else
      required_set := null;
    end if;
  else
    entries := p_schema;
    required_set := null;
  end if;

  for k, descriptor in
    select key, value from jsonb_each(entries) where jsonb_typeof(value) = 'object'
  loop
    if required_set is not null then
      is_required := required_set @> to_jsonb(k);
    else
      is_required := coalesce((descriptor ->> 'required')::boolean, false);
    end if;

    raw_value := p_params ->> k;

    if is_required and (raw_value is null or btrim(raw_value) = '') then
      raise exception 'param "%" is required', k
        using errcode = 'check_violation';
    end if;

    if raw_value is null or btrim(raw_value) = '' then
      continue;
    end if;

    enum_values := descriptor -> 'enum';
    declared_type := descriptor ->> 'type';

    if enum_values is not null and jsonb_typeof(enum_values) = 'array' then
      if not (enum_values @> to_jsonb(raw_value)) then
        raise exception 'param "%" must be one of the allowed values', k
          using errcode = 'check_violation';
      end if;
      continue;
    end if;

    if declared_type = 'number' then
      begin
        perform raw_value::numeric;
      exception when others then
        raise exception 'param "%" must be a number', k
          using errcode = 'check_violation';
      end;
    end if;
  end loop;
end;
$$;

revoke all on function validate_template_params(jsonb, jsonb) from public;
grant execute on function validate_template_params(jsonb, jsonb) to anon, authenticated;

-- Main entry point. Returns the new task id.
create or replace function instantiate_template(p_template_id uuid, p_params jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  template_row task_templates%rowtype;
  resolved_title text;
  resolved_description text;
  cloned_plan jsonb;
  initial_status text;
  new_task_id uuid;
  effective_params jsonb := coalesce(p_params, '{}'::jsonb);
begin
  select * into template_row from task_templates where id = p_template_id;
  if not found then
    raise exception 'template % not found', p_template_id
      using errcode = 'no_data_found';
  end if;

  perform validate_template_params(template_row.params_schema, effective_params);

  if template_row.title_template is not null and template_row.title_template <> '' then
    resolved_title := render_params_template(template_row.title_template, effective_params);
  else
    resolved_title := template_row.task_title;
  end if;

  if template_row.description_template is not null and template_row.description_template <> '' then
    resolved_description := render_params_template(template_row.description_template, effective_params);
  else
    resolved_description := coalesce(template_row.task_description, '');
  end if;

  cloned_plan := reset_plan_for_instance(template_row.plan);

  if cloned_plan is not null
     and jsonb_typeof(cloned_plan) = 'object'
     and jsonb_typeof(cloned_plan -> 'steps') = 'array'
     and jsonb_array_length(cloned_plan -> 'steps') > 0
  then
    initial_status := 'awaiting_approval';
  else
    initial_status := 'todo';
  end if;

  insert into tasks (title, description, status, plan, run_id, error_message, artifacts)
    values (
      resolved_title,
      resolved_description,
      initial_status,
      cloned_plan,
      null,
      null,
      '[]'::jsonb
    )
    returning id into new_task_id;

  return new_task_id;
end;
$$;

revoke all on function instantiate_template(uuid, jsonb) from public;
grant execute on function instantiate_template(uuid, jsonb) to anon, authenticated;
