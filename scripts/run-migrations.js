#!/usr/bin/env node

/**
 * Run all Supabase migrations in order
 * Usage: node scripts/run-migrations.js
 * 
 * Requires:
 * - VITE_SUPABASE_URL in .env
 * - SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Error: Missing environment variables');
  console.error('   VITE_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', serviceRoleKey ? '✓' : '✗');
  console.error('\nAdd SUPABASE_SERVICE_ROLE_KEY to .env file');
  process.exit(1);
}

// Create admin client
const supabase = createClient(supabaseUrl, serviceRoleKey);

// Migration files in order
const migrations = [
  '20260412_raja_aksesoris_pos.sql',
  '20260412_product_code_and_stock_mutations.sql',
  '20260412_pos_v2_modules.sql',
  '20260412_layanan_fields.sql',
  '20260416_01_wallet_manual_control_enums.sql',
  '20260416_02_wallet_manual_control_backfill.sql',
  '20260416_03_logistics_service_recording.sql',
  '20260417_01_split_payment_method.sql',
  '20260417_02_shift_management.sql',
  '20260417_03_atomic_pos_consistency.sql',
  '20260417_05_product_recycle_bin.sql',
  '20260417_06_digital_service_cashier_fields.sql',
  '20260417_07_service_products_and_transaction_fields.sql',
  '20260417_08_digital_wallet_payment_validation.sql',
  '20260417_09_digital_services_complete.sql',
  '20260418_01_digital_services_pasarkuota_deduction.sql',
  '20260418_02_service_product_transaction_views.sql',
  '20260418_03_shift_approve_with_correction.sql',
  '20260418_04_service_product_service_type.sql',
  '20260418_05_digital_services_flexible_pricing_wallet_deduction.sql',
  '20241002_shift_system.sql',
  '20260418_06_security_lockdown_views.sql',
  '20260418_07_shift_rls_fix.sql',
  '20260418_08_runtime_schema_repair.sql',
  '20260418_09_digital_payment_source_fix.sql',
  '20260418_10_digital_customer_payment_split.sql',
  '20260418_11_transfer_manual_transactions.sql',
  '20260419_01_fix_financial_logs_typo.sql',
  '20260419_02_lockdown_shift_views.sql',
  '20260419_03_fix_produk_aktif_column.sql',
  '20260419_04_repair_mutations_products_services.sql',
  '20260419_05_fix_metode_bayar_wallet_values.sql',
  '20260419_06_remove_refund_features.sql',
  '20260419_07_security_hardening_review_fixes.sql',
  '20260419_08_service_transactions_recording_only.sql',
  '20260419_09_dual_service_payment_recording.sql',
  '20260419_99_fix_shift_reporting_and_triggers.sql',
  '20260419_99_repair_product_service_write_paths.sql',
  '20260419_99_z_pasarkuota_qris_wallet_flow.sql',
  '20260419_99_zz_global_sales_report_item_snapshots.sql',
  '20260420_01_delete_service_product_atomic.sql',
  '20260420_02_transaction_recycle_bin.sql',
  '20260420_03_stock_opname.sql',
  '20260425_01_supplier_returns.sql',
  '20260425_02_customer_payment_methods.sql',
  '20260426_01_shift_auto_close_0500.sql',
  '20260512_01_audit_logs_and_summary_views.sql',
  '20260512_02_transaction_history_summary_view.sql',
  '20260514_01_sales_report_server_queries.sql',
  '20260514_02_employee_management_production.sql',
  '20260514_03_pin_requirement_setting.sql',
  '20260514_04_security_controls.sql',
  '20260514_05_employee_session_presence.sql',
  '20260514_05a_repair_missing_logistics_table.sql',
  '20260514_06_production_hardening_activation.sql',
  '20260523_01_get_my_profile_rpc.sql',
  '20260524_01_employee_intelligence_foundation.sql',
  '20260526_01_add_emoney_payment_method.sql',
  '20260526_02_digital_service_category_expansion.sql',
  '20260526_03_security_boundary_enforcement.sql',
  '20260527_01_money_flow_idempotency.sql',
  '20260527_02_audit_storage_retention_foundation.sql',
];

async function runMigrations() {
  console.log('🚀 Starting migrations...\n');
  
  let successful = 0;
  let failed = 0;

  for (const migration of migrations) {
    const filePath = join('supabase', 'migrations', migration);
    
    try {
      const sql = readFileSync(filePath, 'utf-8');
      
      console.log(`⏳ Running: ${migration}`);
      
      const { error } = await supabase.rpc('exec_sql', { sql });
      
      if (error) {
        console.error(`   ❌ Failed: ${error.message}\n`);
        failed++;
      } else {
        console.log(`   ✅ Success\n`);
        successful++;
      }
    } catch (err) {
      console.error(`   ❌ Error reading file: ${err.message}\n`);
      failed++;
    }
  }

  console.log('\n📊 Migration Summary');
  console.log(`   ✅ Successful: ${successful}`);
  console.log(`   ❌ Failed: ${failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All migrations completed successfully!');
  } else {
    console.log('\n⚠️  Some migrations failed. Check errors above.');
    process.exit(1);
  }
}

runMigrations().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
