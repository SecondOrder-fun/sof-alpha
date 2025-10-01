# Transactions and Token Holders Tabs - FIXED

## Issue Resolution

**Problem**: The Transactions and Token Holders tabs were only displaying for a few seconds before automatically switching back to the Token Info tab.

**Root Cause**: Two issues were identified:

1. **Tabs component state management**: The `Tabs` component was not properly implementing controlled state. It received `value` and `onValueChange` props but didn't use them internally to control which tab content was displayed.

2. **Tab state reset on re-render** (PRIMARY ISSUE): In `RaffleDetails.jsx`, the tab state was defined inside an IIFE (Immediately Invoked Function Expression) that created a new component instance on every parent re-render. When `TransactionsTab` or `HoldersTab` used `useCurveEvents` to invalidate React Query queries, it triggered a parent re-render, which recreated the tab component and reset the state back to `'token-info'`.

## Changes Made

### 1. Fixed `src/components/common/Tabs.jsx`

- Added React Context (`TabsContext`) to properly manage tab state
- Updated `Tabs` component to accept and provide `value` and `onValueChange` via context
- Updated `TabsTrigger` to:
  - Read active state from context
  - Call `onValueChange` when clicked
  - Set proper `aria-selected` attribute based on active state
- Updated `TabsContent` to:
  - Read active state from context
  - Return `null` if not the active tab (proper conditional rendering)
  - Only render children when active

### 2. Updated `src/routes/RaffleDetails.jsx` (CRITICAL FIX)

- **Moved tab state to parent component level**: Added `const [activeTab, setActiveTab] = useState('token-info')` at the top of the `RaffleDetails` component
- **Removed IIFE wrapper**: Eliminated the `TabsBlock` component that was being recreated on every render
- **Direct Tabs usage**: Tabs now directly use the parent component's state, which persists across re-renders
- Removed redundant conditional rendering (`{activeTab === 'token-info' && ...}`)
- Removed redundant `onClick` handlers on `TabsTrigger` components
- Cleaned up obsolete comment blocks

### 3. Updated `src/routes/Curve.jsx`

- Removed redundant conditional rendering
- Removed redundant `onClick` handlers on `TabsTrigger` components
- Simplified tab structure to rely on component's internal logic

### 4. Updated `src/components/curve/BuySellWidget.jsx`

- Removed redundant conditional rendering for buy/sell tabs
- Removed redundant `onClick` handlers on `TabsTrigger` components
- Simplified tab structure

## Technical Details

The fix implements a proper controlled component pattern with persistent state:

1. **Parent component** maintains `activeTab` state at the component level (not inside a nested function)
2. **State persistence**: Because the state is defined at the parent component level, it survives re-renders caused by React Query invalidations
3. **Tabs component** receives `value={activeTab}` and `onValueChange={setActiveTab}`
4. **TabsContext** provides state to all child components
5. **TabsTrigger** reads context to determine if it's active and calls `onValueChange` when clicked
6. **TabsContent** reads context and only renders when its `value` matches the active tab

### Why the Original Code Failed

```javascript
// ❌ BAD: State resets on every render
{(() => {
  const TabsBlock = () => {
    const [activeTab, setActiveTab] = useState('token-info'); // Resets!
    return <Tabs value={activeTab} onValueChange={setActiveTab}>...</Tabs>;
  };
  return <TabsBlock />;
})()}

// ✅ GOOD: State persists across renders
const RaffleDetails = () => {
  const [activeTab, setActiveTab] = useState('token-info'); // Persists!
  return <Tabs value={activeTab} onValueChange={setActiveTab}>...</Tabs>;
};
```

This eliminates the state reset issue and ensures the selected tab remains active even when child components trigger query invalidations.

## Testing

All changes have been tested and linter passes with no errors related to these modifications.

---

## Original Implementation Plan (Completed)

**Status**: Ready for Implementation
**Date**: 2025-10-01
**Scope**: Frontend-only MVP (No Backend Dependencies)

---

## Important Note: Backend Scope

**We are NOT implementing backend functionality for this MVP.**

All data will be fetched directly from on-chain sources using Viem and the existing contract ABIs. This approach:
- Eliminates backend dependencies
- Ensures data accuracy (source of truth is always on-chain)
- Simplifies deployment and maintenance
- Provides real-time data without indexer lag

---

## Revised Step-by-Step Implementation Plan

### **Phase 1: Install Dependencies**

1. **Install TanStack Table**
   ```bash
   npm install @tanstack/react-table
   ```
   - Provides sorting, filtering, pagination capabilities
   - Headless UI library (full control over styling)
   - Already using TanStack Query, so good ecosystem fit

---

### **Phase 2: Create On-Chain Data Fetching Hooks**

2. **Create `useRaffleTransactions` hook** (`src/hooks/useRaffleTransactions.js`)
   - Fetch `PositionUpdate` events from bonding curve contract using Viem
   - Parse events to extract: timestamp, player address, tickets delta, transaction hash
   - Use React Query for caching and automatic refetching
   - Support pagination via block range queries
   - **Data structure**:
     ```js
     {
       txHash: string,
       blockNumber: number,
       timestamp: number,
       player: address,
       oldTickets: bigint,
       newTickets: bigint,
       ticketsDelta: bigint, // calculated
       type: 'buy' | 'sell', // derived from delta
     }
     ```

3. **Create `useRaffleHolders` hook** (`src/hooks/useRaffleHolders.js`)
   - Query `RafflePositionTracker` contract for all player snapshots
   - Aggregate data from `PositionSnapshot` events
   - Calculate current positions and win probabilities
   - Use React Query with longer stale time (30s) since this changes less frequently
   - **Data structure**:
     ```js
     {
       player: address,
       ticketCount: bigint,
       winProbabilityBps: number,
       totalTicketsAtTime: bigint,
       lastUpdate: number,
       rank: number, // calculated client-side
     }
     ```

---

### **Phase 3: Enhanced TransactionsTab Component**

4. **Upgrade `src/components/curve/TransactionsTab.jsx`**
   - Replace basic Transfer event table with full PositionUpdate event tracking
   - Implement TanStack Table with the following features:

   **Columns**:
   - Type (Buy/Sell badge with color coding)
   - Player (truncated address with copy button)
   - Tickets Changed (with +/- indicator)
   - New Total (player's total after transaction)
   - Time (relative time: "2 minutes ago")
   - Transaction (link to block explorer)

   **Features**:
   - Sortable columns (default: newest first)
   - Pagination (10/25/50 rows per page)
   - Filter by transaction type (All/Buy/Sell)
   - Search by player address
   - Real-time updates every 15 seconds via React Query
   - Loading skeleton while fetching
   - Empty state with helpful message

   **UI Enhancements**:
   - Green badge for "Buy", red badge for "Sell"
   - Monospace font for addresses and numbers
   - Hover effects on rows
   - Click transaction hash to open in block explorer
   - Responsive design (stack on mobile)

---

### **Phase 4: Enhanced HoldersTab Component**

5. **Upgrade `src/components/curve/HoldersTab.jsx`**
   - Replace placeholder with full implementation using on-chain data
   - Implement TanStack Table with the following features:

   **Columns**:
   - Rank (1, 2, 3, 4...)
   - Player Address (with connected wallet highlight)
   - Tickets (formatted with commas)
   - Win Probability (percentage with progress bar)
   - Share of Total (percentage)
   - Last Update (relative time)

   **Features**:
   - Sortable columns (default: by tickets descending)
   - Pagination (10/25/50 rows per page)
   - Search/filter by address
   - Highlight connected wallet's row with special styling
   - Show total holder count in header
   - Real-time updates every 15 seconds
   - Loading skeleton while fetching
   - Empty state for no holders

   **Visual Enhancements**:
   - Top 3 holders get special badges:
     - 🥇 Rank 1 (gold)
     - 🥈 Rank 2 (silver)
     - 🥉 Rank 3 (bronze)
   - Win probability shown as:
     - Percentage text
     - Visual progress bar (colored by probability tier)
   - Connected wallet row highlighted with border/background
   - Responsive design (hide less important columns on mobile)

---

### **Phase 5: Real-Time Updates Integration**

6. **Integrate with existing event system**:
   - Connect both tabs to `useCurveEvents` hook
   - On `PositionUpdate` event:
     - Invalidate `useRaffleTransactions` query cache
     - Invalidate `useRaffleHolders` query cache
     - Trigger immediate refetch
   - Smooth transitions when data updates (no jarring jumps)
   - Optional: Show subtle notification badge when new data arrives

---

### **Phase 6: Shared Table Components**

7. **Create reusable table components** (`src/components/common/DataTable/`)
   - `DataTable.jsx` - Base TanStack Table wrapper
   - `DataTablePagination.jsx` - Pagination controls
   - `DataTableColumnHeader.jsx` - Sortable column headers
   - `DataTableToolbar.jsx` - Search and filter controls
   - These can be reused across the app for consistency

---

### **Phase 7: Internationalization**

8. **Add i18n translations**:
   - Update `public/locales/en/raffle.json` with new keys:
     ```json
     {
       "transactions": "Transactions",
       "tokenHolders": "Token Holders",
       "transactionType": "Type",
       "buy": "Buy",
       "sell": "Sell",
       "ticketsChanged": "Tickets Changed",
       "newTotal": "New Total",
       "rank": "Rank",
       "shareOfTotal": "Share of Total",
       "lastUpdate": "Last Update",
       "noTransactions": "No transactions yet",
       "noHolders": "No token holders yet",
       "loadingTransactions": "Loading transactions...",
       "loadingHolders": "Loading holders...",
       "rowsPerPage": "Rows per page",
       "of": "of",
       "page": "Page",
       "previous": "Previous",
       "next": "Next",
       "searchAddress": "Search address...",
       "filterByType": "Filter by type",
       "all": "All",
       "yourPosition": "Your Position"
     }
     ```
   - Copy to all other language files (de, es, fr, ja, zh, ko, pt, ru)
   - Use translation keys throughout components

---

### **Phase 8: Testing**

9. **Create comprehensive tests**:
   - `tests/hooks/useRaffleTransactions.test.js` - Mock Viem responses
   - `tests/hooks/useRaffleHolders.test.js` - Mock contract queries
   - `tests/components/TransactionsTab.test.jsx` - Table rendering and interactions
   - `tests/components/HoldersTab.test.jsx` - Table rendering and sorting
   - Test edge cases:
     - Empty data
     - Large datasets (1000+ rows)
     - Real-time updates
     - Pagination
     - Sorting and filtering

---

### **Phase 9: Performance Optimization**

10. **Optimize for production**:
    - Memoize expensive calculations (rank, percentages)
    - Debounce search inputs (300ms)
    - Use React Query's stale-while-revalidate strategy
    - Implement virtual scrolling if needed (TanStack Virtual)
    - Lazy load block explorer links
    - Optimize re-renders with React.memo where appropriate

---

### **Phase 10: Documentation**

11. **Update documentation**:
    - Add inline JSDoc comments for all hooks
    - Update `instructions/project-tasks.md`
    - Document event structures in code comments
    - Add usage examples in component files

---

## Technical Implementation Details

### **On-Chain Data Fetching Strategy**

**For Transactions (PositionUpdate events)**:
```js
// Fetch last N blocks of events
const logs = await publicClient.getLogs({
  address: bondingCurveAddress,
  event: parseAbiItem('event PositionUpdate(address indexed player, uint256 oldTickets, uint256 newTickets, uint256 totalTickets)'),
  fromBlock: currentBlock - 10000n, // ~33 hours on 12s blocks
  toBlock: 'latest'
});
```

**For Holders (aggregate from events)**:
```js
// Option 1: Query RafflePositionTracker for snapshots
const snapshots = await publicClient.getLogs({
  address: trackerAddress,
  event: parseAbiItem('event PositionSnapshot(address indexed player, uint256 ticketCount, uint256 winProbabilityBps, uint256 totalTicketsAtTime, uint256 timestamp)'),
  fromBlock: seasonStartBlock,
  toBlock: 'latest'
});

// Option 2: Direct contract calls for current state
const holders = []; // discovered from events
for (const holder of holders) {
  const tickets = await publicClient.readContract({
    address: bondingCurveAddress,
    abi: curveAbi,
    functionName: 'playerTickets',
    args: [holder]
  });
}
```

### **TanStack Table Configuration**

```js
const table = useReactTable({
  data,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  state: {
    sorting,
    columnFilters,
    pagination,
  },
  onSortingChange: setSorting,
  onColumnFiltersChange: setColumnFilters,
  onPaginationChange: setPagination,
});
```

### **Real-Time Update Pattern**

```js
// In TransactionsTab and HoldersTab
useCurveEvents(bondingCurveAddress, {
  onPositionUpdate: () => {
    // Invalidate queries to trigger refetch
    queryClient.invalidateQueries(['raffleTransactions', seasonId]);
    queryClient.invalidateQueries(['raffleHolders', seasonId]);
  }
});
```

---

## File Structure

```
src/
├── components/
│   ├── common/
│   │   └── DataTable/
│   │       ├── DataTable.jsx (new)
│   │       ├── DataTablePagination.jsx (new)
│   │       ├── DataTableColumnHeader.jsx (new)
│   │       └── DataTableToolbar.jsx (new)
│   └── curve/
│       ├── TransactionsTab.jsx (upgrade)
│       └── HoldersTab.jsx (upgrade)
├── hooks/
│   ├── useRaffleTransactions.js (new)
│   └── useRaffleHolders.js (new)
└── tests/
    ├── components/
    │   ├── TransactionsTab.test.jsx (new)
    │   └── HoldersTab.test.jsx (new)
    └── hooks/
        ├── useRaffleTransactions.test.js (new)
        └── useRaffleHolders.test.js (new)
```

---

## Key Design Decisions

### **Why No Backend?**
- **Simplicity**: Fewer moving parts, easier deployment
- **Accuracy**: On-chain data is always source of truth
- **Real-time**: No indexer lag or sync issues
- **Cost**: No server infrastructure needed
- **Trust**: Users can verify data directly on-chain

### **Why TanStack Table?**
- Headless (full control over UI)
- Excellent TypeScript support
- Built-in sorting, filtering, pagination
- Lightweight and performant
- Already using TanStack Query

### **Data Freshness Strategy**
- **Polling**: 15-second intervals for background updates
- **Event-driven**: Instant updates on PositionUpdate events
- **Stale-while-revalidate**: Show cached data immediately, update in background
- **Manual refresh**: User can force refresh if needed

### **Performance Considerations**
- Limit event queries to reasonable block ranges (10,000 blocks)
- Use pagination to limit rendered rows
- Memoize calculations (rank, percentages)
- Debounce search inputs
- Consider virtual scrolling for 1000+ rows

---

## Estimated Effort

- **Phase 1**: 5 minutes (install dependency)
- **Phase 2**: 2-3 hours (on-chain data hooks)
- **Phase 3**: 2-3 hours (TransactionsTab upgrade)
- **Phase 4**: 2-3 hours (HoldersTab upgrade)
- **Phase 5**: 1 hour (real-time integration)
- **Phase 6**: 1-2 hours (shared components)
- **Phase 7**: 1 hour (i18n)
- **Phase 8**: 2-3 hours (testing)
- **Phase 9**: 1 hour (optimization)
- **Phase 10**: 30 minutes (documentation)

**Total**: ~13-18 hours for complete implementation

---

## Success Criteria

- ✅ Users can view all transactions for a raffle season
- ✅ Users can see current token holder rankings
- ✅ Tables support sorting, filtering, and pagination
- ✅ Data updates in real-time when new transactions occur
- ✅ Connected wallet's position is highlighted
- ✅ All text is internationalized
- ✅ Performance is smooth with 1000+ transactions
- ✅ Works on mobile devices
- ✅ All tests pass
- ✅ No backend dependencies

---

## Future Enhancements (Post-MVP)

- Export to CSV functionality
- Advanced filtering (date ranges, amount ranges)
- Transaction details modal with full event data
- Holder portfolio view (historical positions)
- Notifications for large transactions
- Analytics dashboard (volume, unique holders, etc.)
- Backend indexer for faster queries (optional)
