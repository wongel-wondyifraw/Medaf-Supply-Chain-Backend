async function test() {
  try {
    // get users
    const usersRes = await fetch('http://localhost:3001/api/users');
    const users = await usersRes.json();
    const admin = users.find(u => u.role === 'Admin');
    if (!admin) return console.log("No admin");

    // login
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: admin.email, password: 'password123' })
    });
    const loginData = await loginRes.json();
    const token = loginData.access_token;

    // create order
    const orderRes = await fetch('http://localhost:3001/api/orders', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({
        merchantId: admin.id,
        receiverId: admin.id,
        storeKeeperId: admin.id
      })
    });
    const orderData = await orderRes.json();
    console.log("Created order:", JSON.stringify(orderData, null, 2));
  } catch(e) {
    console.error(e);
  }
}
test();
