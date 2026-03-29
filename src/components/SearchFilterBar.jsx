import { Search, SlidersHorizontal, LayoutGrid, List, ChevronDown } from 'lucide-react'

export default function SearchFilterBar({
  searchQuery,
  onSearchChange,
  category,
  onCategoryChange,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
  totalCount,
  variant = 'agents',
}) {
  const categories = ['All categories', 'Development Team', 'AI Specialists']
  const sortOptions = ['Most Popular', 'A-Z', 'Z-A', 'Newest']

  return (
    <div className="px-8 pb-4">
      {/* Search and filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Inline Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder={variant === 'teams' ? 'Search teams...' : 'Search components...'}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-bg-input border border-border-subtle rounded-xl pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20"
          />
        </div>

        {variant === 'agents' && (
          <>
            {/* Category Dropdown */}
            <div className="relative">
              <select
                value={category}
                onChange={(e) => onCategoryChange(e.target.value)}
                className="appearance-none bg-bg-input border border-border-subtle rounded-xl pl-4 pr-10 py-2.5 text-sm text-text-secondary cursor-pointer hover:border-border-hover focus:outline-none focus:border-accent-blue/50"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>

            {/* Filters Button */}
            <button className="flex items-center gap-2 bg-bg-input border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-secondary hover:border-border-hover hover:text-text-primary transition-colors">
              <SlidersHorizontal size={15} />
              <span>Filters</span>
            </button>

            {/* View Toggle */}
            <div className="flex items-center bg-bg-input border border-border-subtle rounded-xl overflow-hidden">
              <button
                onClick={() => onViewModeChange('grid')}
                className={`p-2.5 transition-colors ${viewMode === 'grid' ? 'bg-accent-blue/10 text-accent-blue' : 'text-text-muted hover:text-text-secondary'}`}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => onViewModeChange('list')}
                className={`p-2.5 transition-colors ${viewMode === 'list' ? 'bg-accent-blue/10 text-accent-blue' : 'text-text-muted hover:text-text-secondary'}`}
              >
                <List size={16} />
              </button>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-text-muted">Sort by</span>
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => onSortChange(e.target.value)}
                  className="appearance-none bg-bg-input border border-border-subtle rounded-xl pl-3 pr-8 py-2.5 text-sm text-text-secondary cursor-pointer hover:border-border-hover focus:outline-none focus:border-accent-blue/50"
                >
                  {sortOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Component Count */}
      <div className="flex items-center gap-3 mt-4">
        <span className="text-sm text-text-secondary">
          <span className="text-text-primary font-semibold">{totalCount}</span> {variant === 'teams' ? 'teams' : 'components'}
        </span>
      </div>
    </div>
  )
}
