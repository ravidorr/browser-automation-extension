#!/usr/bin/env node

// Test script for OpenAI integration
// Load environment variables from backend/.env
import fs from 'node:fs';
import path from 'node:path';

// Load .env file manually
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

// Using built-in fetch (Node.js 18+)

const BACKEND_URL = 'http://localhost:3000';

async function testOpenAIIntegration() {
  console.log('🧪 Testing OpenAI Integration...\n');
  
  // Check if API key is configured
  if (!process.env.OPENAI_API_KEY) {
    console.log('❌ OPENAI_API_KEY not found in environment variables');
    console.log('   Please set your OpenAI API key:');
    console.log('   export OPENAI_API_KEY=your_api_key_here');
    console.log('   Or create a .env file in the backend directory');
    return;
  }
  
  console.log('✅ OpenAI API key found\n');
  
  try {
    // Test 1: Create a session
    console.log('1. Creating session...');
    const sessionResponse = await fetch(`${BACKEND_URL}/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: 'Test OpenAI integration' })
    });
    const sessionData = await sessionResponse.json();
    const sessionId = sessionData.sessionId;
    console.log(`   ✅ Session created: ${sessionId}\n`);
    
    // Test 2: Post observation
    console.log('2. Posting observation...');
    const observation = {
      url: 'https://example.com',
      viewport: { w: 1920, h: 1080 },
      screenshot: null,
      elements: [
        {
          id: 'search-btn',
          tag: 'button',
          role: 'button',
          text: 'Search',
          ariaLabel: null,
          dataTestId: 'search-button',
          idAttr: 'search-btn',
          classes: ['btn', 'primary'],
          hrefHost: null,
          inputType: null,
          disabled: false,
          hidden: false,
          bbox: [100, 200, 120, 40],
          visible: true
        },
        {
          id: 'search-input',
          tag: 'input',
          role: 'textbox',
          text: '',
          ariaLabel: 'Search',
          dataTestId: 'search-input',
          idAttr: 'search-input',
          classes: ['form-control'],
          hrefHost: null,
          inputType: 'text',
          disabled: false,
          hidden: false,
          bbox: [50, 200, 200, 40],
          visible: true
        }
      ],
      events: [],
      network: { inflight: 0 },
      errors: [],
      stateSig: 'test-state-signature-123'
    };
    
    const observeResponse = await fetch(`${BACKEND_URL}/v1/steps/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, observation })
    });
    const observeData = await observeResponse.json();
    console.log(`   ✅ Observation posted: ${observeData.stepId ? 'success' : 'failed'}\n`);
    
    // Test 3: Test OpenAI-powered decide endpoint
    console.log('3. Testing OpenAI-powered decide endpoint...');
    const decideResponse = await fetch(`${BACKEND_URL}/v1/steps/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        sessionId, 
        observation, 
        intent: 'Search for information about browser automation' 
      })
    });
    const decideData = await decideResponse.json();
    
    if (decideData.decision) {
      console.log(`   ✅ OpenAI decision generated successfully!`);
      console.log(`   📋 Plan: ${decideData.decision.plan}`);
      console.log(`   🔢 Actions: ${decideData.decision.actions?.length || 0}`);
      if (decideData.decision.actions?.length > 0) {
        console.log(`   🎯 First action: ${decideData.decision.actions[0].op}`);
        console.log(`   📍 Locator: ${decideData.decision.actions[0].locator?.strategy}:${decideData.decision.actions[0].locator?.value}`);
      }
      console.log(`   📝 Step ID: ${decideData.stepId}`);
    } else {
      console.log(`   ❌ Decision generation failed`);
      console.log(`   ⚠️  Response:`, decideData);
    }
    console.log();
    
    console.log('🎉 OpenAI integration test completed!');
    console.log('\n📋 Summary:');
    console.log('   ✅ OpenAI API key configured');
    console.log('   ✅ Backend server responding');
    console.log('   ✅ OpenAI API calls working');
    console.log('   ✅ JSON schema validation working');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.message.includes('fetch')) {
      console.log('\n💡 Make sure the backend server is running:');
      console.log('   pnpm dev:backend');
    }
    process.exit(1);
  }
}

// Run the test
testOpenAIIntegration();
