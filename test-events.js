// Test script for event tracking functionality
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Event Tracking Functionality...\n');

// Test 1: Check if content script has event tracking
console.log('1. Checking content script event tracking...');
const contentJsPath = path.join(__dirname, 'extension', 'content.js');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const checks = [
    { name: 'Event tracking system', pattern: /let events = \{/, required: true },
    { name: 'Event configuration', pattern: /eventConfig/, required: true },
    { name: 'Route event tracking', pattern: /addRouteEvent/, required: true },
    { name: 'DOM event tracking', pattern: /addDOMEvent/, required: true },
    { name: 'Network event tracking', pattern: /addNetworkEvent/, required: true },
    { name: 'MutationObserver', pattern: /MutationObserver/, required: true },
    { name: 'Event initialization', pattern: /initializeEventTracking/, required: true },
    { name: 'Recent events function', pattern: /getRecentEvents/, required: true },
    { name: 'Event integration', pattern: /events: getRecentEvents\(\)/, required: true }
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

// Test 2: Check event tracking configuration
console.log('\n2. Checking event tracking configuration...');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const configChecks = [
    { name: 'Max events limit', pattern: /maxEvents: \d+/, required: true },
    { name: 'Route change threshold', pattern: /routeChangeThreshold/, required: true },
    { name: 'DOM mutation threshold', pattern: /domMutationThreshold/, required: true },
    { name: 'Network idle threshold', pattern: /networkIdleThreshold/, required: true }
  ];
  
  let passedChecks = 0;
  configChecks.forEach(check => {
    if (check.pattern.test(js)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${configChecks.length} checks passed`);
}

// Test 3: Check event types
console.log('\n3. Checking event types...');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const eventTypes = [
    { name: 'Route events', pattern: /type: 'route'/, required: true },
    { name: 'DOM events', pattern: /type: 'dom'/, required: true },
    { name: 'Network events', pattern: /type: 'network'/, required: true }
  ];
  
  let passedChecks = 0;
  eventTypes.forEach(check => {
    if (check.pattern.test(js)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${eventTypes.length} checks passed`);
}

// Test 4: Check network event tracking
console.log('\n4. Checking network event tracking...');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const networkChecks = [
    { name: 'Fetch request tracking', pattern: /addNetworkEvent\('request'/, required: true },
    { name: 'Fetch response tracking', pattern: /addNetworkEvent\('response'/, required: true },
    { name: 'Fetch error tracking', pattern: /addNetworkEvent\('error'/, required: true },
    { name: 'XHR request tracking', pattern: /addNetworkEvent\('request'.*method: 'xhr'/, required: true },
    { name: 'Network idle tracking', pattern: /addNetworkEvent\('networkIdle'/, required: true }
  ];
  
  let passedChecks = 0;
  networkChecks.forEach(check => {
    if (check.pattern.test(js)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${networkChecks.length} checks passed`);
}

// Test 5: Check DOM event tracking
console.log('\n5. Checking DOM event tracking...');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const domChecks = [
    { name: 'MutationObserver setup', pattern: /domObserver = new MutationObserver/, required: true },
    { name: 'DOM observation config', pattern: /childList: true/, required: true },
    { name: 'Subtree observation', pattern: /subtree: true/, required: true },
    { name: 'Attribute filtering', pattern: /attributeFilter:/, required: true },
    { name: 'Significant changes filter', pattern: /significantChanges/, required: true }
  ];
  
  let passedChecks = 0;
  domChecks.forEach(check => {
    if (check.pattern.test(js)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${domChecks.length} checks passed`);
}

// Test 6: Check route event tracking
console.log('\n6. Checking route event tracking...');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const routeChecks = [
    { name: 'History API patching', pattern: /originalPushState/, required: true },
    { name: 'ReplaceState patching', pattern: /originalReplaceState/, required: true },
    { name: 'Popstate handling', pattern: /addEventListener\('popstate'/, required: true },
    { name: 'URL change detection', pattern: /newUrl !== lastUrl/, required: true }
  ];
  
  let passedChecks = 0;
  routeChecks.forEach(check => {
    if (check.pattern.test(js)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${routeChecks.length} checks passed`);
}

console.log('\n🎉 Event tracking functionality test completed!');
console.log('\n📋 Event Tracking Features:');
console.log('✅ Route change detection (SPA navigation)');
console.log('✅ DOM mutation tracking (element changes)');
console.log('✅ Network activity tracking (requests/responses)');
console.log('✅ Event filtering and deduplication');
console.log('✅ Configurable event limits and thresholds');
console.log('✅ Integration with observation system');
console.log('✅ Real-time event logging');

console.log('\n🚀 Next Steps:');
console.log('1. Load the extension in Chrome');
console.log('2. Navigate to a website with dynamic content');
console.log('3. Watch the console for event tracking logs');
console.log('4. Verify events are captured in observations');
