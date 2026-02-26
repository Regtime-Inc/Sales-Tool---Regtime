import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, X, Search } from 'lucide-react';
import { ZONE_GROUPS } from '../lib/discovery/zoningDistricts';

function Checkbox({ checked, partial }: { checked: boolean; partial?: boolean }) {
  return (
    <span
      className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[8px] shrink-0 ${
        checked
          ? 'bg-teal-600 border-teal-600 text-white'
          : partial
            ? 'bg-teal-100 border-teal-400 text-teal-600'
            : 'border-slate-300'
      }`}
    >
      {checked ? '\u2713' : partial ? '\u2013' : ''}
    </span>
  );
}

interface ZoneDropdownProps {
  selected: string[];
  onChange: (value: string[]) => void;
}

export default function ZoneDropdown({ selected, onChange }: ZoneDropdownProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const query = search.toUpperCase().trim();

  const filteredGroups = useMemo(() => {
    if (!query) return ZONE_GROUPS;
    return ZONE_GROUPS.map((g) => {
      const groupMatch =
        g.prefix.toUpperCase().includes(query) || g.label.toUpperCase().includes(query);
      if (groupMatch) return g;
      const filteredSubs = g.subDistricts.filter(
        (sd) =>
          sd.code.toUpperCase().includes(query) ||
          sd.name.toUpperCase().includes(query) ||
          (sd.resEquiv && sd.resEquiv.toUpperCase().includes(query))
      );
      if (filteredSubs.length === 0) return null;
      return { ...g, subDistricts: filteredSubs };
    }).filter(Boolean) as typeof ZONE_GROUPS;
  }, [query]);

  function toggleSub(code: string) {
    onChange(
      selectedSet.has(code)
        ? selected.filter((s) => s !== code)
        : [...selected, code]
    );
  }

  function toggleGroup(prefix: string) {
    const group = ZONE_GROUPS.find((g) => g.prefix === prefix);
    if (!group) return;
    const codes = group.subDistricts.map((sd) => sd.code);
    const allSelected = codes.every((c) => selectedSet.has(c));
    if (allSelected) {
      onChange(selected.filter((s) => !codes.includes(s)));
    } else {
      const toAdd = codes.filter((c) => !selectedSet.has(c));
      onChange([...selected, ...toAdd]);
    }
  }

  function toggleExpand(prefix: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  }

  const summaryText = useMemo(() => {
    if (selected.length === 0) return 'All Zones';
    if (selected.length <= 3) return selected.join(', ');
    return `${selected.length} zones selected`;
  }, [selected]);

  const visibleTags = useMemo(() => {
    if (selected.length <= 6) return selected;
    return selected.slice(0, 5);
  }, [selected]);
  const hiddenCount = selected.length - visibleTags.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2.5 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-400 transition-colors"
      >
        <span className="truncate">{summaryText}</span>
        <ChevronDown
          className={`h-3 w-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {visibleTags.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200"
            >
              {s}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSub(s);
                }}
                className="hover:text-teal-900"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          {hiddenCount > 0 && (
            <span className="text-[9px] text-slate-400 px-1 py-0.5">
              +{hiddenCount} more
            </span>
          )}
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-1 w-80 bg-white border border-slate-200 rounded-lg shadow-lg max-h-80 flex flex-col">
          <div className="px-2 py-1.5 border-b border-slate-100 flex items-center gap-1.5">
            <Search className="h-3 w-3 text-slate-400 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search zones..."
              className="w-full text-xs text-slate-700 bg-transparent outline-none placeholder:text-slate-300"
            />
          </div>

          <div className="overflow-y-auto flex-1">
            {filteredGroups.map((group) => {
              const codes = group.subDistricts.map((sd) => sd.code);
              const selectedCount = codes.filter((c) => selectedSet.has(c)).length;
              const allSelected = selectedCount === codes.length;
              const isExpanded = expanded.has(group.prefix) || query.length > 0;

              return (
                <div key={group.prefix}>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => toggleExpand(group.prefix)}
                      className="px-1.5 py-1.5 text-slate-400 hover:text-slate-600"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.prefix)}
                      className={`flex-1 flex items-center gap-1.5 py-1.5 pr-3 text-xs transition-colors ${
                        allSelected
                          ? 'text-teal-700 font-semibold'
                          : 'text-slate-700 font-medium'
                      } hover:bg-slate-50`}
                    >
                      <Checkbox
                        checked={allSelected}
                        partial={selectedCount > 0 && !allSelected}
                      />
                      <span>
                        {group.prefix} - {group.label}
                      </span>
                      {selectedCount > 0 && !allSelected && (
                        <span className="text-[9px] text-teal-500 ml-auto">
                          {selectedCount}/{codes.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="ml-5 border-l border-slate-100">
                      {group.subDistricts.map((sd) => {
                        const active = selectedSet.has(sd.code);
                        return (
                          <button
                            key={sd.code}
                            type="button"
                            onClick={() => toggleSub(sd.code)}
                            className={`w-full flex items-center gap-1.5 pl-3 pr-3 py-1 text-[11px] transition-colors ${
                              active
                                ? 'bg-teal-50/60 text-teal-700'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                            }`}
                          >
                            <Checkbox checked={active} />
                            <span className="font-mono text-[10px] w-10 shrink-0 text-slate-400">
                              {sd.code}
                            </span>
                            <span className="truncate">{sd.name}</span>
                            {sd.resEquiv && (
                              <span className="ml-auto text-[9px] text-sky-500 shrink-0">
                                ={sd.resEquiv}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredGroups.length === 0 && (
              <div className="px-3 py-4 text-center text-[11px] text-slate-400">
                No matching zones
              </div>
            )}
          </div>

          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-center px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-600 border-t border-slate-100 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
