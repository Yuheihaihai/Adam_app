require('dotenv').config();
const { runDiscoveryOnce } = require('../vendorDiscovery');

(async () => {
  try {
    const result = await runDiscoveryOnce();
    console.log('[VendorDiscovery] completed', result);
    process.exit(0);
  } catch (e) {
    console.error('[VendorDiscovery] failed', e);
    process.exit(1);
  }
})();


