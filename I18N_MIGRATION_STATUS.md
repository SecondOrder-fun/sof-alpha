# i18n Component Migration Status

**Last Updated**: 2025-09-30

## Overview

This document tracks the progress of migrating all SecondOrder.fun components to use react-i18next for internationalization support (English and Japanese).

## Translation Files Status

### ✅ Completed Translation Files

All 8 translation namespaces have been created and populated with translations:

- **navigation.json** - Navigation, footer, and branding (29 keys)
- **common.json** - Common UI elements and actions (70 keys)
- **raffle.json** - Raffle-specific terminology (67 keys)
- **market.json** - InfoFi prediction market terms (74 keys)
- **admin.json** - Admin panel and season management (69 keys)
- **account.json** - User account pages
- **errors.json** - Error messages
- **transactions.json** - Web3 transaction messages

## Component Migration Progress

### ✅ Completed Components (26/49)

#### Layout Components (2/2)
- ✅ **Header.jsx** - Fully translated with language toggle
- ✅ **Footer.jsx** - All sections translated (platform, resources, legal, copyright)

#### Raffle Components (2/3)
- ✅ **RaffleList.jsx** - Season list with translations
- ✅ **RaffleDetailsCard.jsx** - Complete raffle interaction UI
- ⏳ **RaffleAdminControls.jsx** - Pending

#### InfoFi Components (9/9) ✅ COMPLETE

- ✅ **ClaimCenter.jsx** - Claim interface
- ✅ **RewardsDebug.jsx** - Debug panel
- ✅ **SettlementStatus.jsx** - Settlement tracking
- ✅ **InfoFiMarketCard.jsx** - Complex market card with live pricing
- ✅ **MarketList.jsx** - Market listing (already translated)
- ✅ **PositionsPanel.jsx** - User positions (already translated)
- ✅ **ArbitrageOpportunityDisplay.jsx** - Real-time arbitrage detection with live updates
- ✅ **InfoFiPricingTicker.jsx** - Live hybrid pricing ticker
- ✅ **RewardsPanel.jsx** - Rewards and prize claiming

#### Curve Components (5/5)

- ✅ **BuySellWidget.jsx** - Buy/sell interface
- ✅ **TokenInfoTab.jsx** - Token information display
- ✅ **CurveGraph.jsx** - Bonding curve visualization with tooltips
- ✅ **HoldersTab.jsx** - Holders list placeholder
- ✅ **TransactionsTab.jsx** - Transaction history table

#### Faucet Components (1/1)
- ✅ **FaucetWidget.jsx** - Complete faucet UI with karma contribution

#### Wallet Components (1/1) ✅ COMPLETE

- ✅ **WalletConnection.jsx** - Wallet connection UI with connector selection

#### Common Components (2/7)

- ✅ **ErrorPage.jsx** - Error display
- ✅ **NetworkToggle.jsx** - Network switcher
- ⏳ **LanguageToggle.jsx** - Already created but not counted in original list
- ⏳ **SSETest.jsx** - Pending
- ⏳ **AddressLink.jsx** - Pending
- ⏳ **ClientOnly.jsx** - No text to translate
- ⏳ **Tabs.jsx** - No text to translate

#### Prizes Components (1/1)
- ✅ **ClaimPrizeWidget.jsx** - Prize claiming interface

### ⏳ Pending Components (32/49)

#### Admin Components (1/5)

- ✅ **SeasonList.jsx** - Season management list with status badges
- ⏳ **CreateSeasonForm.jsx** - Complex form with many fields
- ⏳ **HealthStatus.jsx** - System health display
- ⏳ **RaffleAdminControls.jsx** - Admin controls

#### Auth Components (0/1)
- ⏳ **FarcasterAuth.jsx** - Authentication UI

#### Wallet Components (0/1)
- ⏳ **WalletConnection.jsx** - Wallet connection UI

#### UI Components (0/14)
- All shadcn/ui components (alert, badge, button, card, dialog, dropdown-menu, input, label, popover, select, tabs, toast, toaster, tooltip)
- These are typically used as-is and don't contain hardcoded text

#### InfoFi Components (Remaining)
- ⏳ **InfoFiMarketCard.jsx** - Main market display card
- ⏳ **MarketList.jsx** - List of markets
- ⏳ **ProbabilityChart.jsx** - Probability visualization
- ⏳ **ArbitrageOpportunityDisplay.jsx** - Arbitrage opportunities
- ⏳ **InfoFiPricingTicker.jsx** - Live pricing ticker
- ⏳ **RewardsPanel.jsx** - Rewards display

#### Curve Components (Remaining)
- ⏳ **CurveGraph.jsx** - Bonding curve visualization
- ⏳ **HoldersTab.jsx** - Token holders list
- ⏳ **TransactionsTab.jsx** - Transaction history

## Translation Key Statistics

### English (EN)
- **navigation.json**: 27 keys
- **common.json**: 70 keys
- **raffle.json**: 67 keys
- **market.json**: 74 keys
- **admin.json**: 69 keys
- **account.json**: ~30 keys
- **errors.json**: ~25 keys
- **transactions.json**: ~20 keys

**Total**: ~382 translation keys

### Japanese (JA)
- All English keys have corresponding Japanese translations
- Translations follow Japanese localization best practices:
  - Technical terms in katakana (ラッフル, マーケット, etc.)
  - Polite form (丁寧語) for UI text
  - Appropriate kanji usage for common actions

## Implementation Patterns

### Standard Migration Pattern

```jsx
// Before
const Component = () => {
  return <div>Hello World</div>;
};

// After
import { useTranslation } from 'react-i18next';

const Component = () => {
  const { t } = useTranslation('namespace');
  return <div>{t('helloWorld')}</div>;
};
```

### Cross-Namespace References

```jsx
// Reference keys from other namespaces
const { t } = useTranslation('raffle');
<p>{t('common:error')}</p>  // Access common namespace
```

### Interpolation

```jsx
// With variables
{t('seasonNumber', { number: seasonId })}

// With pluralization
{t('ticketCount', { count: tickets })}
```

## Next Steps

### High Priority
1. **InfoFiMarketCard.jsx** - Most complex remaining component
2. **CreateSeasonForm.jsx** - Admin form with extensive text
3. **SeasonList.jsx** - Admin management interface

### Medium Priority
4. **MarketList.jsx** - Market listing
5. **PositionsPanel.jsx** - User positions
6. **ArbitrageOpportunityDisplay.jsx** - Arbitrage UI
7. **CurveGraph.jsx** - Graph labels and tooltips

### Low Priority
8. **HoldersTab.jsx** - Holder list
9. **TransactionsTab.jsx** - Transaction history
10. **SSETest.jsx** - Debug/test component
11. **WalletConnection.jsx** - Wallet UI

## Testing Checklist

- [ ] All pages render correctly in English
- [ ] All pages render correctly in Japanese
- [ ] Language toggle works on all pages
- [ ] No missing translation warnings in console
- [ ] Text doesn't overflow in either language
- [ ] Forms work correctly in both languages
- [ ] Error messages display in correct language
- [ ] Transaction toasts show in correct language
- [ ] Date/time formatting respects locale
- [ ] Number formatting respects locale

## Known Issues

None currently identified.

## Notes

- UI components (shadcn/ui) don't require translation as they don't contain hardcoded text
- Some components like `ClientOnly.jsx` and `Tabs.jsx` are wrappers with no text content
- Debug components may have lower priority for translation
- All translations follow the project's style guide for consistency

## Resources

- **Translation Files**: `/public/locales/{en,ja}/*.json`
- **i18n Config**: `/src/i18n/config.js`
- **Language Toggle**: `/src/components/common/LanguageToggle.jsx`
- **Integration Plan**: `/instructions/i18n-integration-plan.md`
