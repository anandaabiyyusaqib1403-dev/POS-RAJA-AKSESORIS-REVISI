# Digital Service Transaction Page UI Refactor
Status: In Progress

**File Target**: `src/pages/DigitalPage.jsx`

## Plan Summary
1. **Grid**: `lg:grid-cols-[7fr_5fr]` (left col-span-7 products, right col-span-5 form)
2. **Left**: Provider horizontal scroll → service type wrap → search full-width → products grid gap-4 2-col
3. **Right**: `sticky top-4 p-5 rounded-2xl shadow-sm`, form `space-y-4 h-12 inputs`
4. **Cards**: `p-4 rounded-2xl hover:shadow-md`
5. **Polish**: Cleaner spacing, hierarchy, professional look

## Next Action
✅ Grid: lg:grid-cols-[7fr_5fr]
✅ Right: sticky p-5 rounded-2xl shadow-sm, space-y-4
✅ Title: text-3xl, quick gap-4
🔄 Fix JSX errors & continue left sections
