/**
 * Optional Install Script
 * 
 * Attempts to install @tensorflow/tfjs-node as an optional dependency.
 * If it fails, the application will fall back to using the JavaScript implementation.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Ensure scripts directory exists
if (!fs.existsSync(path.join(__dirname))) {
  fs.mkdirSync(path.join(__dirname), { recursive: true });
}

console.log('Attempting to install optional TensorFlow.js Node.js backend...');

try {
  // Try to install @tensorflow/tfjs-node
  execSync('npm install --no-save @tensorflow/tfjs-node', { stdio: 'inherit' });
  console.log('SUCCESS: @tensorflow/tfjs-node was installed successfully!');
  console.log('The application will use the native TensorFlow backend for better performance.');
} catch (error) {
  console.log('WARNING: Could not install @tensorflow/tfjs-node.');
  console.log('This is not a critical error. The application will continue to work using the JavaScript implementation.');
  console.log('Performance may be slightly reduced for machine learning operations.');
  console.log('\nIf you want to install the native backend manually, try:');
  console.log('npm install @tensorflow/tfjs-node');
  console.log('\nError details:', error.message);
}

// Write a flag file to indicate we've attempted installation
fs.writeFileSync(
  path.join(__dirname, 'tf-install-attempted.txt'), 
  `Installation attempt at: ${new Date().toISOString()}\n`,
  'utf8'
);

console.log('Optional dependency installation process completed.'); 