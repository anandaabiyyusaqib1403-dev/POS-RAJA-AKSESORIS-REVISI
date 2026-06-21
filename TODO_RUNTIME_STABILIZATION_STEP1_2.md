# TODO Runtime Stabilization (Step 1 + 2)

## Step 1 — Instrumentasi aman (tanpa spam logs)
- [ ] Tambahkan mount/unmount tracing untuk `DataProvider` (gunakan counter via ref).
- [ ] Tambahkan tracing feature-level (Dashboard shell, dan halaman utama yang pakai DataProvider) *jika ada hook sederhana;* minimal pada `AuthenticatedDataGate` dan `DataProvider`.
- [ ] Tambahkan tracing realtime subscribe lifecycle (jumlah channel subscribe aktif, dan cleanup).
- [ ] Tambahkan tracing stage load start/end di `loadData()` dan `loadBackgroundData()` (stageName + elapsed ms).
- [ ] Pastikan log hanya saat event signifikan (bukan tiap render).

## Step 2 — Hardening effect `low-stock notification` di `src/contexts/DataProvider.jsx`
- [ ] Ganti guard `loading=false` agar effect hanya jalan setelah core data loaded (pakai `coreLoading`/`hasCompletedInitialLoadRef`).
- [ ] Tambahkan cooldown (misal 60 detik) agar tidak membuat Notification berulang.
- [ ] Pastikan effect tidak memicu rerender loop (guard pakai refs + dependency minimal).

## Verification
- [ ] `npm run build` sukses.
- [ ] Jalankan POS dengan safe mode ON.
- [ ] Cek: tidak ada loading infinite, tidak ada render storm, memory stabil setelah idle.

