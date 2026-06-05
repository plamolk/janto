async function runQATests() {
  console.log('\n======================================================');
  console.log('  🛡️ INITIATING ANTIGRAVITY QA VALIDATION TESTS 🛡️');
  console.log('======================================================\n');

  try {
    console.log('▶️  TEST A: Empty Customer Name Validation');
    console.log('   👤 Attempting to POST customer with name: "   "');
    
    const customerRes = await fetch('http://localhost:3000/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: '   ', last_name: 'Test' })
    });
    
    const customerData = await customerRes.json();
    
    if (customerRes.status === 400 && customerData.error === 'ข้อมูลไม่ถูกต้อง / Invalid data') {
      console.log('   🟢 SUCCESS: Backend rejected empty name correctly (400 Bad Request)');
    } else {
      console.error(`   🔴 FAILED: Expected 400 with Invalid data error, got ${customerRes.status}`, customerData);
    }

    console.log('\n▶️  TEST B: Negative Price Validation');
    console.log('   💸 Attempting to POST visit with lens_price: -1500');
    
    const visitRes = await fetch('http://localhost:3000/api/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: 1, lens_price: -1500, frame_price: 100 })
    });
    
    const visitData = await visitRes.json();
    
    if (visitRes.status === 400 && visitData.error === 'ข้อมูลไม่ถูกต้อง / Invalid data') {
      console.log('   🟢 SUCCESS: Backend rejected negative price correctly (400 Bad Request)');
    } else {
      console.error(`   🔴 FAILED: Expected 400 with Invalid data error, got ${visitRes.status}`, visitData);
    }

    console.log('\n======================================================');
    console.log('  🎉 ANTIGRAVITY QA TESTS COMPLETED 🎉');
    console.log('======================================================\n');

  } catch (err) {
    console.error('\n   ❌ ERROR DURING QA TESTS:');
    console.error('Make sure the backend server is running on http://localhost:3000');
    console.error(err);
  }
}

runQATests();
