// Integration test for popup + background + backend
import fs from 'node:fs';
import path from 'node:path';

// Load environment variables from backend/.env
const envPath = path.join(__dirname, 'backend', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

console.log('🧪 Testing Full Integration (Popup + Background + Backend)...\n');

// Test 1: Check backend is running
async function testBackend() {
  console.log('1. Testing backend connectivity...');
  
  try {
    const response = await fetch('http://localhost:3000/health');
    if (response.ok) {
      const data = await response.json();
      console.log('   ✅ Backend is running');
      console.log(`   📊 Status: ${data.status}, Time: ${data.timestamp}`);
      return true;
    } else {
      console.log('   ❌ Backend responded with error');
      return false;
    }
  } catch (error) {
    console.log('   ❌ Backend not accessible');
    console.log(`   🔍 Error: ${error.message}`);
    return false;
  }
}

// Test 2: Test session creation
async function testSessionCreation() {
  console.log('\n2. Testing session creation...');
  
  try {
    const response = await fetch('http://localhost:3000/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: 'Test integration' })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('   ✅ Session created successfully');
      console.log(`   📊 Session ID: ${data.sessionId}`);
      return data.sessionId;
    } else {
      console.log('   ❌ Session creation failed');
      const errorText = await response.text();
      console.log(`   🔍 Error: ${errorText}`);
      return null;
    }
  } catch (error) {
    console.log('   ❌ Session creation error');
    console.log(`   🔍 Error: ${error.message}`);
    return null;
  }
}

// Test 3: Test observation posting
async function testObservationPosting(sessionId) {
  console.log('\n3. Testing observation posting...');
  
  if (!sessionId) {
    console.log('   ⚠️  Skipping - no session ID');
    return false;
  }
  
  const observation = {
    url: 'https://example.com',
    viewport: { w: 1920, h: 1080 },
    elements: [
      {
        id: 'test-element',
        role: 'button',
        text: 'Test Button',
        bbox: [100, 100, 200, 50],
        visible: true
      }
    ],
    events: [],
    network: { inflight: 0 },
    errors: [],
    stateSig: 'test-signature'
  };
  
  try {
    const response = await fetch('http://localhost:3000/v1/steps/observe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, observation })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('   ✅ Observation posted successfully');
      console.log(`   📊 Step ID: ${data.stepId}`);
      return true;
    } else {
      console.log('   ❌ Observation posting failed');
      const errorText = await response.text();
      console.log(`   🔍 Error: ${errorText}`);
      return false;
    }
  } catch (error) {
    console.log('   ❌ Observation posting error');
    console.log(`   🔍 Error: ${error.message}`);
    return false;
  }
}

// Test 4: Test decision generation
async function testDecisionGeneration(sessionId) {
  console.log('\n4. Testing decision generation...');
  
  if (!sessionId) {
    console.log('   ⚠️  Skipping - no session ID');
    return false;
  }
  
  const observation = {
    url: 'https://example.com',
    viewport: { w: 1920, h: 1080 },
    elements: [
      {
        id: 'test-element',
        role: 'button',
        text: 'Test Button',
        bbox: [100, 100, 200, 50],
        visible: true
      }
    ],
    events: [],
    network: { inflight: 0 },
    errors: [],
    stateSig: 'test-signature'
  };
  
  try {
    const response = await fetch('http://localhost:3000/v1/steps/decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        sessionId, 
        observation,
        intent: 'Test the integration functionality'
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('   ✅ Decision generated successfully');
      console.log(`   📊 Plan: ${data.plan}`);
      console.log(`   📊 Actions: ${data.actions?.length || 0}`);
      if (data.finish) {
        console.log(`   📊 Finish Reason: ${data.finish.reason}`);
      }
      return true;
    } else {
      console.log('   ❌ Decision generation failed');
      const errorText = await response.text();
      console.log(`   🔍 Error: ${errorText}`);
      return false;
    }
  } catch (error) {
    console.log('   ❌ Decision generation error');
    console.log(`   🔍 Error: ${error.message}`);
    return false;
  }
}

// Test 5: Check extension files
function testExtensionFiles() {
  console.log('\n5. Checking extension files...');
  
  const requiredFiles = [
    'extension/manifest.json',
    'extension/popup.html',
    'extension/popup.js',
    'extension/bg.js',
    'extension/content.js'
  ];
  
  let allPresent = true;
  requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
      console.log(`   ✅ ${file}`);
    } else {
      console.log(`   ❌ ${file} missing`);
      allPresent = false;
    }
  });
  
  return allPresent;
}

// Test 6: Check manifest configuration
function testManifestConfiguration() {
  console.log('\n6. Checking manifest configuration...');
  
  try {
    const manifestPath = path.join(__dirname, 'extension', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    const checks = [
      { name: 'Manifest version', value: manifest.manifest_version === 3, required: true },
      { name: 'Popup action', value: !!manifest.action, required: true },
      { name: 'Background service worker', value: !!manifest.background, required: true },
      { name: 'Content scripts', value: !!manifest.content_scripts, required: true },
      { name: 'Storage permission', value: manifest.permissions?.includes('storage'), required: true },
      { name: 'Active tab permission', value: manifest.permissions?.includes('activeTab'), required: true },
      { name: 'Scripting permission', value: manifest.permissions?.includes('scripting'), required: true }
    ];
    
    let passedChecks = 0;
    checks.forEach(check => {
      if (check.value) {
        console.log(`   ✅ ${check.name}`);
        passedChecks++;
      } else {
        console.log(`   ❌ ${check.name}`);
      }
    });
    
    console.log(`   📊 ${passedChecks}/${checks.length} checks passed`);
    return passedChecks === checks.length;
  } catch (error) {
    console.log('   ❌ Manifest parsing error');
    console.log(`   🔍 Error: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runIntegrationTests() {
  const results = {
    backend: false,
    session: false,
    observation: false,
    decision: false,
    extensionFiles: false,
    manifest: false
  };
  
  // Run tests
  results.backend = await testBackend();
  
  if (results.backend) {
    results.session = await testSessionCreation();
    if (results.session) {
      results.observation = await testObservationPosting(results.session);
      results.decision = await testDecisionGeneration(results.session);
    }
  }
  
  results.extensionFiles = testExtensionFiles();
  results.manifest = testManifestConfiguration();
  
  // Summary
  console.log('\n📋 Integration Test Summary:');
  console.log('============================');
  
  const testNames = {
    backend: 'Backend Connectivity',
    session: 'Session Creation',
    observation: 'Observation Posting',
    decision: 'Decision Generation',
    extensionFiles: 'Extension Files',
    manifest: 'Manifest Configuration'
  };
  
  let passedTests = 0;
  Object.keys(results).forEach(test => {
    const status = results[test] ? '✅' : '❌';
    console.log(`${status} ${testNames[test]}`);
    if (results[test]) passedTests++;
  });
  
  console.log(`\n📊 ${passedTests}/${Object.keys(results).length} tests passed`);
  
  if (passedTests === Object.keys(results).length) {
    console.log('\n🎉 All integration tests passed!');
    console.log('\n🚀 The system is ready for use:');
    console.log('1. Load the extension in Chrome');
    console.log('2. Click the extension icon');
    console.log('3. Enter a goal and click "Start Automation"');
    console.log('4. Watch the AI-powered automation in action!');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the issues above.');
  }
}

// Run the tests
runIntegrationTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
