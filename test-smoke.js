#!/usr/bin/env node

// Simple smoke test validation script
import fs from 'node:fs';
import yaml from 'js-yaml';

try {
  // Read smoke.yaml
  const smokeFile = fs.readFileSync('smoke.yaml', 'utf8');
  const smokeTests = yaml.load(smokeFile);
  
  console.log('✅ Smoke Tests Validation');
  console.log('========================');
  
  // Validate smoke tests
  if (smokeTests.smoke_tests && smokeTests.smoke_tests.length === 10) {
    console.log(`✅ Found ${smokeTests.smoke_tests.length} smoke test intents`);
    
    smokeTests.smoke_tests.forEach((test, index) => {
      console.log(`${index + 1}. ${test.name}: "${test.intent}"`);
    });
  } else {
    console.log('❌ Expected 10 smoke test intents');
  }
  
  // Validate test websites
  if (smokeTests.test_websites && smokeTests.test_websites.length === 3) {
    console.log(`\n✅ Found ${smokeTests.test_websites.length} test websites`);
    
    smokeTests.test_websites.forEach(site => {
      console.log(`- ${site.name}: ${site.url}`);
    });
  }
  
  // Validate success criteria
  if (smokeTests.success_criteria && smokeTests.success_criteria.length > 0) {
    console.log(`\n✅ Found ${smokeTests.success_criteria.length} success criteria`);
  }
  
  console.log('\n🎉 Smoke tests validation complete!');
  
} catch (error) {
  console.error('❌ Error validating smoke tests:', error.message);
  process.exit(1);
}
