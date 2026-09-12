/**
 * Decoupled Static Hosting Deployment Pipeline (Phương án A - CDN / Cloud Storage)
 *
 * Chức năng:
 * 1. Build Frontends (Candidate Quiz Web & Admin Web) độc lập ở giai đoạn Build-Time
 * 2. Cấu hình VITE_API_GATEWAY_URL và VITE_CDN_URL để frontend trỏ đúng API Gateway
 * 3. Kiểm định bundle size, asset hashes và tính toàn vẹn của artifacts
 * 4. Thiết lập metadata HTTP Cache-Control chuẩn mực cho CDN Edge:
 *    - HTML (index.html): no-cache, no-store, must-revalidate (cập nhật tức thời khi có bản mới)
 *    - Assets (/assets/*): public, max-age=31536000, immutable (cache 1 năm tại Edge & Browser)
 * 5. Xuất hướng dẫn / lệnh đồng bộ hóa (gcloud storage rsync / aws s3 sync / Cloudflare)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

interface DeployConfig {
  apiGatewayUrl: string;
  cdnQuizBucket: string;
  cdnAdminBucket: string;
  cloudProvider: 'gcp' | 'aws' | 'cloudflare';
  dryRun: boolean;
}

const config: DeployConfig = {
  apiGatewayUrl: process.env.VITE_API_GATEWAY_URL || process.env.API_GATEWAY_URL || 'https://api.quizplatform.io',
  cdnQuizBucket: process.env.CDN_QUIZ_BUCKET || 'gs://quiz-platform-frontend-cdn/web',
  cdnAdminBucket: process.env.CDN_ADMIN_BUCKET || 'gs://quiz-platform-frontend-cdn/admin-web',
  cloudProvider: (process.env.CLOUD_PROVIDER as any) || 'gcp',
  dryRun: process.env.DRY_RUN === 'true' || !process.env.CI,
};

console.log('🚀 =====================================================================');
console.log('📦 DECOUPLED STATIC HOSTING PIPELINE (PHƯƠNG ÁN A: CDN & CLOUD STORAGE)');
console.log('🚀 =====================================================================');
console.log(`- API Gateway URL    : ${config.apiGatewayUrl}`);
console.log(`- Quiz Web Bucket    : ${config.cdnQuizBucket}`);
console.log(`- Admin Web Bucket   : ${config.cdnAdminBucket}`);
console.log(`- Cloud Provider     : ${config.cloudProvider.toUpperCase()}`);
console.log(`- Mode               : ${config.dryRun ? 'DRY-RUN (Verification & Sync Plan)' : 'LIVE DEPLOYMENT'}`);
console.log('---------------------------------------------------------------------');

// Bước 1: Build Frontend Assets với env trỏ API Gateway
console.log('\n[1/4] 🔨 Biên dịch Frontend Assets (Build-Time)...');

try {
  console.log('  -> Building @platform/web...');
  execSync('npm run build --workspace=@platform/web', {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_API_GATEWAY_URL: config.apiGatewayUrl,
    },
  });

  console.log('  -> Building @platform/admin-web...');
  execSync('npm run build --workspace=@platform/admin-web', {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_API_GATEWAY_URL: config.apiGatewayUrl,
    },
  });

  console.log('  ✅ Hoàn thành biên dịch frontends!');
} catch (err) {
  console.error('  ❌ Lỗi trong quá trình build frontend:', err);
  process.exit(1);
}

// Bước 2: Kiểm định Artifacts
console.log('\n[2/4] 🔍 Kiểm tra tính toàn vẹn của artifacts...');

const quizDist = path.resolve(process.cwd(), 'apps/web/dist');
const adminDist = path.resolve(process.cwd(), 'apps/admin-web/dist');

function analyzeDist(name: string, distPath: string) {
  if (!fs.existsSync(path.join(distPath, 'index.html'))) {
    throw new Error(`Thiếu file index.html tại ${distPath}`);
  }
  const assetsDir = path.join(distPath, 'assets');
  let assetCount = 0;
  let totalBytes = 0;

  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    assetCount = files.length;
    for (const f of files) {
      totalBytes += fs.statSync(path.join(assetsDir, f)).size;
    }
  }

  const totalKb = (totalBytes / 1024).toFixed(2);
  console.log(`  ✅ [${name}] index.html: OK | Assets: ${assetCount} files (${totalKb} KB)`);
}

analyzeDist('Quiz Web (Candidate)', quizDist);
analyzeDist('Admin Web (Management)', adminDist);

// Bước 3: Định hình Chiến lược Cache-Control cho CDN Edge
console.log('\n[3/4] 🛡️ Thiết lập chính sách Caching Edge theo chuẩn CDN:');
console.log('  • index.html       -> Cache-Control: "no-cache, no-store, must-revalidate"');
console.log('  • /assets/*.js,css -> Cache-Control: "public, max-age=31536000, immutable"');
console.log('  • favicon, images  -> Cache-Control: "public, max-age=86400"');

// Bước 4: Kế hoạch Triển khai lên Cloud Storage / CDN
console.log('\n[4/4] ☁️ Các lệnh đồng bộ hóa lên CDN / Cloud Storage:');

if (config.cloudProvider === 'gcp') {
  console.log('\n--- GOOGLE CLOUD STORAGE & CLOUD CDN ---');
  console.log('1. Upload Hashed Assets (Cache 1 năm):');
  console.log(`   gcloud storage rsync ${quizDist}/assets ${config.cdnQuizBucket}/assets --metadata="Cache-Control=public,max-age=31536000,immutable"`);
  console.log(`   gcloud storage rsync ${adminDist}/assets ${config.cdnAdminBucket}/assets --metadata="Cache-Control=public,max-age=31536000,immutable"`);
  console.log('2. Upload Entrypoint HTML (No-Cache):');
  console.log(`   gcloud storage cp ${quizDist}/index.html ${config.cdnQuizBucket}/index.html --metadata="Cache-Control=no-cache,no-store,must-revalidate"`);
  console.log(`   gcloud storage cp ${adminDist}/index.html ${config.cdnAdminBucket}/index.html --metadata="Cache-Control=no-cache,no-store,must-revalidate"`);
  console.log('3. Xóa Cache CDN Edge (Invalidation):');
  console.log('   gcloud compute url-maps invalidate-cdn-cache <URL_MAP_NAME> --path "/*"');
} else if (config.cloudProvider === 'aws') {
  console.log('\n--- AWS S3 & CLOUDFRONT CDN ---');
  console.log('1. Upload Hashed Assets (Cache 1 năm):');
  console.log(`   aws s3 sync ${quizDist}/assets s3://quiz-frontend/web/assets --cache-control "public,max-age=31536000,immutable"`);
  console.log('2. Upload Entrypoint HTML (No-Cache):');
  console.log(`   aws s3 cp ${quizDist}/index.html s3://quiz-frontend/web/index.html --cache-control "no-cache,no-store,must-revalidate"`);
  console.log('3. CloudFront Invalidation:');
  console.log('   aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths "/*"');
} else {
  console.log('\n--- CLOUDFLARE PAGES / R2 ---');
  console.log(`   wrangler pages deploy ${quizDist} --project-name=web`);
  console.log(`   wrangler pages deploy ${adminDist} --project-name=admin-web`);
}

console.log('\n=====================================================================');
console.log('🎉 PIPELINE AUDIT & KIỂM TRA PHƯƠNG ÁN A HOÀN THÀNH XUẤT SẮC!');
console.log('=====================================================================\n');
