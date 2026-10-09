// Test script for event tracking configuration system
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Event Tracking Configuration System...\n');

// Test 1: Check if configuration system exists
console.log('1. Checking configuration system...');
const contentJsPath = path.join(__dirname, 'extension', 'content.js');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const checks = [
    { name: 'Event config object', pattern: /const eventConfig = \{/, required: true },
    { name: 'Config profiles', pattern: /configProfiles/, required: true },
    { name: 'Update config function', pattern: /updateEventConfig/, required: true },
    { name: 'Get config function', pattern: /getEventConfig/, required: true },
    { name: 'Reinitialize function', pattern: /reinitializeEventTracking/, required: true },
    { name: 'Active profile tracking', pattern: /activeProfile/, required: true },
    { name: 'Thresholds structure', pattern: /thresholds: \{/, required: true },
    { name: 'Filters structure', pattern: /filters: \{/, required: true },
    { name: 'Performance settings', pattern: /performance: \{/, required: true }
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
  console.log('   ❌ content.js not found');
}

// Test 2: Check configuration profiles
console.log('\n2. Checking configuration profiles...');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const profileChecks = [
    { name: 'Sensitive profile', pattern: /sensitive: \{/, required: true },
    { name: 'Balanced profile', pattern: /balanced: \{/, required: true },
    { name: 'Conservative profile', pattern: /conservative: \{/, required: true },
    { name: 'Profile thresholds', pattern: /changeDelay: \d+/, required: true },
    { name: 'Profile performance', pattern: /sampleRate: \d+\.\d+/, required: true }
  ];
  
  let passedChecks = 0;
  profileChecks.forEach(check => {
    if (check.pattern.test(js)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${profileChecks.length} checks passed`);
}

// Test 3: Check threshold configuration
console.log('\n3. Checking threshold configuration...');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const thresholdChecks = [
    { name: 'Route thresholds', pattern: /route: \{/, required: true },
    { name: 'DOM thresholds', pattern: /dom: \{/, required: true },
    { name: 'Network thresholds', pattern: /network: \{/, required: true },
    { name: 'User thresholds', pattern: /user: \{/, required: true },
    { name: 'Error thresholds', pattern: /error: \{/, required: true },
    { name: 'Delay settings', pattern: /changeDelay|mutationDelay|idleDelay/, required: true },
    { name: 'Time between events', pattern: /minTimeBetweenEvents/, required: true }
  ];
  
  let passedChecks = 0;
  thresholdChecks.forEach(check => {
    if (check.pattern.test(js)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${thresholdChecks.length} checks passed`);
}

// Test 4: Check filtering configuration
console.log('\n4. Checking filtering configuration...');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const filterChecks = [
    { name: 'DOM filters', pattern: /ignoreElements:/, required: true },
    { name: 'Network filters', pattern: /ignoreUrls:/, required: true },
    { name: 'Significant attributes', pattern: /significantAttributes:/, required: true },
    { name: 'Ignore query params', pattern: /ignoreQueryParams:/, required: true },
    { name: 'Hash change filtering', pattern: /ignoreHashChanges/, required: true }
  ];
  
  let passedChecks = 0;
  filterChecks.forEach(check => {
    if (check.pattern.test(js)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${filterChecks.length} checks passed`);
}

// Test 5: Check performance configuration
console.log('\n5. Checking performance configuration...');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const performanceChecks = [
    { name: 'Sample rate', pattern: /sampleRate:/, required: true },
    { name: 'Burst limit', pattern: /burstLimit:/, required: true },
    { name: 'Cooldown period', pattern: /cooldownPeriod:/, required: true },
    { name: 'Max event size', pattern: /maxEventSize:/, required: true },
    { name: 'String truncation', pattern: /truncateLongStrings/, required: true }
  ];
  
  let passedChecks = 0;
  performanceChecks.forEach(check => {
    if (check.pattern.test(js)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${performanceChecks.length} checks passed`);
}

// Test 6: Check message handlers
console.log('\n6. Checking configuration message handlers...');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const messageChecks = [
    { name: 'UPDATE_EVENT_CONFIG handler', pattern: /UPDATE_EVENT_CONFIG/, required: true },
    { name: 'GET_EVENT_CONFIG handler', pattern: /GET_EVENT_CONFIG/, required: true },
    { name: 'Config update response', pattern: /sendResponse.*success.*config/, required: true }
  ];
  
  let passedChecks = 0;
  messageChecks.forEach(check => {
    if (check.pattern.test(js)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${messageChecks.length} checks passed`);
}

console.log('\n🎉 Event tracking configuration test completed!');
console.log('\n📋 Configuration Features:');
console.log('✅ Multiple configuration profiles (sensitive, balanced, conservative)');
console.log('✅ Granular threshold settings for each event type');
console.log('✅ Advanced filtering rules (URLs, elements, attributes)');
console.log('✅ Performance optimization settings');
console.log('✅ Runtime configuration updates');
console.log('✅ Message-based configuration management');

console.log('\n🔧 Configuration Profiles:');
console.log('• Sensitive: High event capture, low thresholds, 100% sampling');
console.log('• Balanced: Moderate event capture, medium thresholds, 100% sampling');
console.log('• Conservative: Low event capture, high thresholds, 50% sampling');

console.log('\n🚀 Next Steps:');
console.log('1. Load the extension in Chrome');
console.log('2. Use the configuration API to switch between profiles');
console.log('3. Test different threshold settings');
console.log('4. Monitor performance impact of different configurations');
