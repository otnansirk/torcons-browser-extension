const fetch = require('node-fetch');

async function test() {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjRkZDRhMjFiLTJjYjEtNDY5OS04YjkyLTE3NWQwNTljM2Y0OSIsImV4cCI6MTc4MjIwNTQ5OSwianRpIjoiN2UxOWEyNjUtOGEwMy00NjcyLWI1ZDItNGRmOWY2OTM5Y2I2In0.wztbolVZ9oXcq1OqEfsERnzPUCyJSAsWtd3onQdvO10';
  
  // 1x1 transparent png base64
  const base64Img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  
  const payload = {
    model: "Torcons",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What is this image?" },
          { type: "image_url", image_url: { url: base64Img } }
        ]
      }
    ],
    stream: false
  };

  try {
    const res = await fetch('https://chat.torcons.ai/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    
    console.log("Status:", res.status);
    const data = await res.text();
    console.log("Response:", data);
  } catch(e) {
    console.error(e);
  }
}

test();
