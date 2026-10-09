// Demonstration script for event tracking configuration system
console.log('🎯 Event Tracking Configuration Demo\n');

console.log('📋 Available Configuration Features:\n');

console.log('1. 🔧 Configuration Profiles:');
console.log('   • sensitive: High event capture, low thresholds');
console.log('   • balanced: Moderate event capture, medium thresholds');
console.log('   • conservative: Low event capture, high thresholds\n');

console.log('2. ⚙️ Granular Thresholds:');
console.log('   • Route: changeDelay, ignoreHashChanges, minTimeBetweenEvents');
console.log('   • DOM: mutationDelay, batchSimilarMutations, minElementSize');
console.log('   • Network: idleDelay, requestTimeout, retryDelay');
console.log('   • User: clickDelay, typeDelay, scrollDelay');
console.log('   • Error: captureJsErrors, captureNetworkErrors\n');

console.log('3. 🚫 Advanced Filtering:');
console.log('   • DOM: ignoreElements, significantAttributes, ignoreClasses');
console.log('   • Network: ignoreUrls, ignoreMethods, captureStatusCodes');
console.log('   • Route: ignoreQueryParams, ignoreHashChanges\n');

console.log('4. ⚡ Performance Settings:');
console.log('   • sampleRate: Event sampling percentage (0.0-1.0)');
console.log('   • burstLimit: Maximum events per burst');
console.log('   • cooldownPeriod: Wait time after burst');
console.log('   • maxEventSize: Maximum bytes per event');
console.log('   • truncateLongStrings: Truncate long text content\n');

console.log('🔧 Usage Examples:\n');

console.log('Example 1: Switch to sensitive profile');
console.log('```javascript');
console.log('chrome.tabs.sendMessage(tabId, {');
console.log('  type: "UPDATE_EVENT_CONFIG",');
console.log('  config: "sensitive"');
console.log('});');
console.log('```\n');

console.log('Example 2: Custom configuration');
console.log('```javascript');
console.log('chrome.tabs.sendMessage(tabId, {');
console.log('  type: "UPDATE_EVENT_CONFIG",');
console.log('  config: {');
console.log('    maxEvents: 15,');
console.log('    thresholds: {');
console.log('      route: { changeDelay: 75, minTimeBetweenEvents: 750 },');
console.log('      dom: { mutationDelay: 30, minTimeBetweenEvents: 75 }');
console.log('    },');
console.log('    performance: { sampleRate: 0.8, burstLimit: 15 }');
console.log('  }');
console.log('});');
console.log('```\n');

console.log('Example 3: Get current configuration');
console.log('```javascript');
console.log('chrome.tabs.sendMessage(tabId, {');
console.log('  type: "GET_EVENT_CONFIG"');
console.log('}, (response) => {');
console.log('  console.log("Current config:", response);');
console.log('});');
console.log('```\n');

console.log('Example 4: Performance optimization');
console.log('```javascript');
console.log('// Reduce event capture for better performance');
console.log('chrome.tabs.sendMessage(tabId, {');
console.log('  type: "UPDATE_EVENT_CONFIG",');
console.log('  config: {');
console.log('    performance: {');
console.log('      sampleRate: 0.3,        // Only capture 30% of events');
console.log('      burstLimit: 5,          // Limit burst to 5 events');
console.log('      cooldownPeriod: 2000,   // 2 second cooldown');
console.log('      maxEventSize: 512       // Limit event size to 512 bytes');
console.log('    }');
console.log('  }');
console.log('});');
console.log('```\n');

console.log('Example 5: Focus on specific events');
console.log('```javascript');
console.log('// Only capture route changes and form submissions');
console.log('chrome.tabs.sendMessage(tabId, {');
console.log('  type: "UPDATE_EVENT_CONFIG",');
console.log('  config: {');
console.log('    thresholds: {');
console.log('      dom: { mutationDelay: 1000 },  // Ignore most DOM changes');
console.log('      network: { idleDelay: 2000 }   // Ignore most network activity');
console.log('    },');
console.log('    filters: {');
console.log('      dom: {');
console.log('        significantAttributes: ["action", "method", "name"]');
console.log('      }');
console.log('    }');
console.log('  }');
console.log('});');
console.log('```\n');

console.log('🎯 Configuration Profiles Comparison:\n');

const profiles = {
  sensitive: {
    description: 'High sensitivity - captures everything',
    maxEvents: 20,
    routeDelay: 50,
    domDelay: 25,
    networkDelay: 250,
    sampleRate: 1.0,
    useCase: 'Debugging, detailed analysis'
  },
  balanced: {
    description: 'Balanced - good for most use cases',
    maxEvents: 10,
    routeDelay: 100,
    domDelay: 50,
    networkDelay: 500,
    sampleRate: 1.0,
    useCase: 'General automation, monitoring'
  },
  conservative: {
    description: 'Conservative - minimal events for performance',
    maxEvents: 5,
    routeDelay: 200,
    domDelay: 100,
    networkDelay: 1000,
    sampleRate: 0.5,
    useCase: 'Production, performance-critical'
  }
};

Object.entries(profiles).forEach(([name, config]) => {
  console.log(`${name.toUpperCase()} Profile:`);
  console.log(`  ${config.description}`);
  console.log(`  Max Events: ${config.maxEvents}`);
  console.log(`  Route Delay: ${config.routeDelay}ms`);
  console.log(`  DOM Delay: ${config.domDelay}ms`);
  console.log(`  Network Delay: ${config.networkDelay}ms`);
  console.log(`  Sample Rate: ${config.sampleRate * 100}%`);
  console.log(`  Use Case: ${config.useCase}\n`);
});

console.log('🚀 Implementation Notes:\n');
console.log('• Configuration changes are applied immediately');
console.log('• Event tracking is reinitialized with new settings');
console.log('• Existing events are cleared when configuration changes');
console.log('• All thresholds are in milliseconds');
console.log('• Sample rates range from 0.0 (0%) to 1.0 (100%)');
console.log('• Performance settings help balance accuracy vs performance');

console.log('\n📊 Monitoring Configuration Impact:\n');
console.log('• Check browser console for configuration change logs');
console.log('• Monitor event counts in observation data');
console.log('• Watch for performance impact on page responsiveness');
console.log('• Verify that filtered events are properly ignored');

console.log('\n✅ Configuration system is ready for use!');
