// Test script for popup functionality
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Popup Functionality...\n');

// Test 1: Check if popup files exist
console.log('1. Checking popup files...');
const popupFiles = ['popup.html', 'popup.js'];
const missingFiles = [];

popupFiles.forEach(file => {
  const filePath = path.join(__dirname, 'extension', file);
  if (fs.existsSync(filePath)) {
    console.log(`   ✅ ${file} exists`);
  } else {
    console.log(`   ❌ ${file} missing`);
    missingFiles.push(file);
  }
});

if (missingFiles.length > 0) {
  console.log(`   ⚠️  Missing files: ${missingFiles.join(', ')}`);
} else {
  console.log('   ✅ All popup files present');
}

// Test 2: Check popup HTML structure
console.log('\n2. Checking popup HTML structure...');
const popupHtmlPath = path.join(__dirname, 'extension', 'popup.html');
if (fs.existsSync(popupHtmlPath)) {
  const html = fs.readFileSync(popupHtmlPath, 'utf8');
  
  const checks = [
    { name: 'Goal input field', pattern: /id="goalInput"/, required: true },
    { name: 'Start button', pattern: /id="startBtn"/, required: true },
    { name: 'Status display', pattern: /id="status"/, required: true },
    { name: 'Goal input label', pattern: /What would you like me to do\?/, required: true },
    { name: 'Placeholder text', pattern: /placeholder=/, required: true },
    { name: 'CSS styles', pattern: /\.goal-input/, required: true }
  ];
  
  let passedChecks = 0;
  checks.forEach(check => {
    if (check.pattern.test(html)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${checks.length} checks passed`);
} else {
  console.log('   ❌ popup.html not found');
}

// Test 3: Check popup JavaScript functionality
console.log('\n3. Checking popup JavaScript...');
const popupJsPath = path.join(__dirname, 'extension', 'popup.js');
if (fs.existsSync(popupJsPath)) {
  const js = fs.readFileSync(popupJsPath, 'utf8');
  
  const checks = [
    { name: 'Goal input handling', pattern: /goalInput\.value/, required: true },
    { name: 'Storage integration', pattern: /chrome\.storage/, required: true },
    { name: 'Message sending', pattern: /START_AUTOMATION/, required: true },
    { name: 'Validation', pattern: /!goal/, required: true },
    { name: 'Error handling', pattern: /borderColor.*#dc3545/, required: true },
    { name: 'Keyboard shortcuts', pattern: /Enter.*ctrlKey/, required: true }
  ];
  
  let passedChecks = 0;
  checks.forEach(check => {
    if (check.pattern.test(js)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${checks.length} checks passed`);
} else {
  console.log('   ❌ popup.js not found');
}

// Test 4: Check background script integration
console.log('\n4. Checking background script integration...');
const bgJsPath = path.join(__dirname, 'extension', 'bg.js');
if (fs.existsSync(bgJsPath)) {
  const js = fs.readFileSync(bgJsPath, 'utf8');
  
  const checks = [
    { name: 'START_AUTOMATION handler', pattern: /START_AUTOMATION/, required: true },
    { name: 'GET_STATUS handler', pattern: /GET_STATUS/, required: true },
    { name: 'Goal validation', pattern: /!goal.*trim/, required: true },
    { name: 'Popup notification', pattern: /STATUS_UPDATE/, required: true },
    { name: 'Storage permission', pattern: /storage/, required: false }
  ];
  
  let passedChecks = 0;
  checks.forEach(check => {
    if (check.pattern.test(js)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else if (!check.required) {
      console.log(`   ⚠️  ${check.name} (optional)`);
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${checks.length} checks passed`);
} else {
  console.log('   ❌ bg.js not found');
}

// Test 5: Check manifest configuration
console.log('\n5. Checking manifest configuration...');
const manifestPath = path.join(__dirname, 'extension', 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  const checks = [
    { name: 'Popup action', pattern: /action.*default_popup/, required: false },
    { name: 'Storage permission', pattern: /storage/, required: true },
    { name: 'Active tab permission', pattern: /activeTab/, required: true },
    { name: 'Scripting permission', pattern: /scripting/, required: true }
  ];
  
  const manifestStr = JSON.stringify(manifest);
  let passedChecks = 0;
  checks.forEach(check => {
    if (check.pattern.test(manifestStr)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else if (!check.required) {
      console.log(`   ⚠️  ${check.name} (optional)`);
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${checks.length} checks passed`);
} else {
  console.log('   ❌ manifest.json not found');
}

console.log('\n🎉 Popup functionality test completed!');
console.log('\n📋 Next Steps:');
console.log('1. Load the extension in Chrome');
console.log('2. Open test-popup.html in a browser');
console.log('3. Click the extension icon to test the popup');
console.log('4. Enter a goal and click "Start Automation"');
console.log('5. Verify the automation starts correctly');
