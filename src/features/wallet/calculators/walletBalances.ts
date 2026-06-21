import {
  walletOverviewPlatforms,
  walletPlatformIds,
  walletPlatformLabelMap,
  walletPlatformTypeMap,
} from "../../../data/businessOptions";
import { normalizeWalletTransaction } from "../../../core/normalizers/walletNormalizer";
import { normalizeWalletId } from "../../../core/normalizers/shared";

export function createEmptyWalletBalanceMap() {
  return walletPlatformIds.reduce<Record<string, number>>((acc, walletId) => {
    acc[walletId] = 0;
    return acc;
  }, {});
}

export function getWalletImpactAmount(transaction: Record<string, any>) {
  return Number(transaction.nominal || 0) + Number(transaction.biaya_admin || 0);
}

export function buildWalletBalanceMap(transactions: Record<string, any>[] = []) {
  const balances = createEmptyWalletBalanceMap();

  transactions.forEach((rawTransaction) => {
    const transaction = normalizeWalletTransaction(rawTransaction);
    const platform = normalizeWalletId(transaction.platform);
    const targetPlatform = transaction.platform_tujuan
      ? normalizeWalletId(transaction.platform_tujuan)
      : null;
    const nominal = Number(transaction.nominal || 0);
    const biayaAdmin = Number(transaction.biaya_admin || 0);
    const outgoing = nominal + biayaAdmin;
    const incoming = Math.max(nominal - biayaAdmin, 0);

    if (transaction.jenis === "masuk") {
      balances[platform] += incoming;
      return;
    }

    if (transaction.jenis === "keluar") {
      balances[platform] -= outgoing;
      return;
    }

    if (transaction.jenis === "tarik_tunai" || transaction.jenis === "transfer_antar") {
      balances[platform] -= outgoing;
      if (targetPlatform) {
        balances[targetPlatform] += incoming;
      }
    }
  });

  return balances;
}

export function buildWalletCards(transactions: Record<string, any>[] = []) {
  const balances = buildWalletBalanceMap(transactions);

  return walletPlatformIds.map((walletId) => ({
    id: walletId,
    name: walletPlatformLabelMap[walletId] || walletId,
    type: walletPlatformTypeMap[walletId] || "validated",
    balance: balances[walletId] || 0,
  }));
}

function createPlatformSummarySeed() {
  return { masuk: 0, keluar: 0, biaya_admin: 0, saldo_bersih: 0 };
}

function applyWalletImpact(summary: Record<string, any>, platform: string, next: Record<string, number>) {
  summary[platform] ??= createPlatformSummarySeed();
  summary[platform].masuk += next.masuk || 0;
  summary[platform].keluar += next.keluar || 0;
  summary[platform].biaya_admin += next.biaya_admin || 0;
  summary[platform].saldo_bersih += next.saldo_bersih || 0;
}

export function summarizeWalletPlatforms(transactions: Record<string, any>[]) {
  const balances = buildWalletBalanceMap(transactions);
  const summary = walletOverviewPlatforms.reduce<Record<string, any>>((acc, platform) => {
    acc[platform] = createPlatformSummarySeed();
    acc[platform].saldo_bersih = balances[platform] || 0;
    return acc;
  }, {});

  transactions.forEach((transaction) => {
    const normalized = normalizeWalletTransaction(transaction);
    const platform = normalizeWalletId(normalized.platform);
    const targetPlatform = normalized.platform_tujuan
      ? normalizeWalletId(normalized.platform_tujuan)
      : null;
    const nominal = Number(normalized.nominal || 0);
    const biayaAdmin = Number(normalized.biaya_admin || 0);
    const outgoing = nominal + biayaAdmin;
    const incoming = Math.max(nominal - biayaAdmin, 0);

    if (normalized.jenis === "masuk") {
      applyWalletImpact(summary, platform, {
        masuk: incoming,
        biaya_admin: biayaAdmin,
      });
      return;
    }

    if (normalized.jenis === "keluar") {
      applyWalletImpact(summary, platform, {
        keluar: outgoing,
        biaya_admin: biayaAdmin,
      });
      return;
    }

    if (normalized.jenis === "tarik_tunai" || normalized.jenis === "transfer_antar") {
      applyWalletImpact(summary, platform, {
        keluar: outgoing,
        biaya_admin: biayaAdmin,
      });
      if (targetPlatform) {
        applyWalletImpact(summary, targetPlatform, {
          masuk: incoming,
        });
      }
    }
  });

  return walletOverviewPlatforms.map((platform) => ({
    platform,
    ...(summary[platform] || createPlatformSummarySeed()),
  }));
}
