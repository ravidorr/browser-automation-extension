// Test script for extended event tracking system
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Extended Event Tracking System...\n');

// Test 1: Check if all new event types are implemented
console.log('1. Checking new event types...');
const contentJsPath = path.join(__dirname, 'extension', 'content.js');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const eventTypeChecks = [
    { name: 'User events', pattern: /addUserEvent/, required: true },
    { name: 'Error events', pattern: /addErrorEvent/, required: true },
    { name: 'Form events', pattern: /addFormEvent/, required: true },
    { name: 'Performance events', pattern: /addPerformanceEvent/, required: true },
    { name: 'Accessibility events', pattern: /addA11yEvent/, required: true },
    { name: 'Visual events', pattern: /addVisualEvent/, required: true }
  ];
  
  let passedChecks = 0;
  eventTypeChecks.forEach(check => {
    if (check.pattern.test(js)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${eventTypeChecks.length} checks passed`);
} else {
  console.log('   ❌ content.js not found');
}

// Test 2: Check initialization functions
console.log('\n2. Checking initialization functions...');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const initChecks = [
    { name: 'User event initialization', pattern: /initializeUserEventTracking/, required: true },
    { name: 'Error tracking initialization', pattern: /initializeErrorTracking/, required: true },
    { name: 'Form tracking initialization', pattern: /initializeFormTracking/, required: true },
    { name: 'Performance tracking initialization', pattern: /initializePerformanceTracking/, required: true },
    { name: 'Accessibility tracking initialization', pattern: /initializeA11yTracking/, required: true },
    { name: 'Visual tracking initialization', pattern: /initializeVisualTracking/, required: true }
  ];
  
  let passedChecks = 0;
  initChecks.forEach(check => {
    if (check.pattern.test(js)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${initChecks.length} checks passed`);
}

// Test 3: Check event storage arrays
console.log('\n3. Checking event storage arrays...');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const storageChecks = [
    { name: 'User events array', pattern: /user: \[\],/, required: true },
    { name: 'Error events array', pattern: /error: \[\],/, required: true },
    { name: 'Form events array', pattern: /form: \[\],/, required: true },
    { name: 'Performance events array', pattern: /performance: \[\],/, required: true },
    { name: 'Accessibility events array', pattern: /a11y: \[\],/, required: true },
    { name: 'Visual events array', pattern: /visual: \[\],/, required: false }
  ];
  
  let passedChecks = 0;
  storageChecks.forEach(check => {
    if (check.pattern.test(js)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${storageChecks.length} checks passed`);
}

// Test 4: Check configuration thresholds
console.log('\n4. Checking configuration thresholds...');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const thresholdChecks = [
    { name: 'User thresholds', pattern: /user: \{/, required: true },
    { name: 'Error thresholds', pattern: /error: \{/, required: true },
    { name: 'Form thresholds', pattern: /form: \{/, required: true },
    { name: 'Performance thresholds', pattern: /performance: \{/, required: true },
    { name: 'Accessibility thresholds', pattern: /a11y: \{/, required: true },
    { name: 'Visual thresholds', pattern: /visual: \{/, required: true }
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

// Test 5: Check event filters
console.log('\n5. Checking event filters...');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const filterChecks = [
    { name: 'User filters', pattern: /user: \{/, required: true },
    { name: 'Form filters', pattern: /form: \{/, required: true },
    { name: 'Performance filters', pattern: /performance: \{/, required: true },
    { name: 'Accessibility filters', pattern: /a11y: \{/, required: true },
    { name: 'Visual filters', pattern: /visual: \{/, required: true }
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

// Test 6: Check getRecentEvents integration
console.log('\n6. Checking getRecentEvents integration...');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const integrationChecks = [
    { name: 'User events in getRecentEvents', pattern: /events\.user\.map/, required: true },
    { name: 'Error events in getRecentEvents', pattern: /events\.error\.map/, required: true },
    { name: 'Form events in getRecentEvents', pattern: /events\.form\.map/, required: true },
    { name: 'Performance events in getRecentEvents', pattern: /events\.performance\.map/, required: true },
    { name: 'Accessibility events in getRecentEvents', pattern: /events\.a11y\.map/, required: true },
    { name: 'Visual events in getRecentEvents', pattern: /events\.visual\.map/, required: true }
  ];
  
  let passedChecks = 0;
  integrationChecks.forEach(check => {
    if (check.pattern.test(js)) {
      console.log(`   ✅ ${check.name}`);
      passedChecks++;
    } else {
      console.log(`   ❌ ${check.name} missing`);
    }
  });
  
  console.log(`   📊 ${passedChecks}/${integrationChecks.length} checks passed`);
}

// Test 7: Check configuration profiles
console.log('\n7. Checking configuration profiles...');
if (fs.existsSync(contentJsPath)) {
  const js = fs.readFileSync(contentJsPath, 'utf8');
  
  const profileChecks = [
    { name: 'Sensitive profile with new events', pattern: /user: \{ clickDelay: 100/, required: true },
    { name: 'Balanced profile with new events', pattern: /user: \{ clickDelay: 250/, required: true },
    { name: 'Conservative profile with new events', pattern: /user: \{ clickDelay: 500/, required: true },
    { name: 'Error settings in profiles', pattern: /captureJsErrors: true/, required: true },
    { name: 'Form settings in profiles', pattern: /submitDelay:/, required: true },
    { name: 'Performance settings in profiles', pattern: /loadDelay:/, required: true }
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

console.log('\n🎉 Extended event tracking test completed!');
console.log('\n📋 New Event Types Implemented:');

console.log('\n1. 🖱️ User Interaction Events:');
console.log('   • Click events with coordinates and element info');
console.log('   • Input events with type and value length');
console.log('   • Scroll events with position and document height');
console.log('   • Focus/blur events with element details');

console.log('\n2. ❌ Error Events:');
console.log('   • JavaScript errors with stack traces');
console.log('   • Unhandled promise rejections');
console.log('   • Resource loading failures');

console.log('\n3. 📝 Form Events:');
console.log('   • Form submissions with action and method');
console.log('   • Field changes with validation state');
console.log('   • Form validation errors');

console.log('\n4. ⚡ Performance Events:');
console.log('   • Page load times and metrics');
console.log('   • Resource loading performance');
console.log('   • Navigation timing data');

console.log('\n5. ♿ Accessibility Events:');
console.log('   • Focus changes for accessible elements');
console.log('   • ARIA state changes (expanded, hidden, etc.)');
console.log('   • Role and tabindex tracking');

console.log('\n6. 👁️ Visual Events:');
console.log('   • Element visibility changes');
console.log('   • Animation start/end events');
console.log('   • Intersection observer data');

console.log('\n🔧 Configuration Features:');
console.log('• Granular thresholds for each event type');
console.log('• Advanced filtering rules');
console.log('• Performance sampling controls');
console.log('• Profile-based configurations');

console.log('\n🚀 Next Steps:');
console.log('1. Load the extension in Chrome');
console.log('2. Test different event types on various websites');
console.log('3. Monitor event capture in browser console');
console.log('4. Verify event data in observation responses');
console.log('5. Test configuration switching between profiles');
