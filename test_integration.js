// Using native global fetch in Node 18+

const runTests = async () => {
  const baseUrl = 'http://localhost:3000/api';
  
  console.log("=== Running Swiftaid Backend Voice/Text Triage Integration Tests ===");
  
  // Test 1: Text Triage Fallback
  try {
    console.log("\nTest 1: Testing Text-only triage parsing...");
    const res = await fetch(`${baseUrl}/triage/voice-parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: "I think my friend is having cardiac arrest chest pain" })
    });
    
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
    if (res.ok && data.emergencyType === 'Cardiac Arrest') {
      console.log("✅ Test 1 Passed!");
    } else {
      console.error("❌ Test 1 Failed!");
    }
  } catch (err) {
    console.error("❌ Test 1 Exception:", err);
  }

  // Test 2: Audio Triage with Gemini (Using a programmatically generated silence WAV file)
  const makeSilenceWav = (durationSeconds = 1) => {
    const sampleRate = 8000;
    const numChannels = 1;
    const bitsPerSample = 8;
    const bytesPerSample = bitsPerSample / 8;
    const dataSize = sampleRate * durationSeconds * numChannels * bytesPerSample;
    const fileSize = 36 + dataSize;

    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(fileSize, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16); // format chunk size
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28); // byte rate
    header.writeUInt16LE(numChannels * bytesPerSample, 32); // block align
    header.writeUInt16LE(bitsPerSample, 34);
    header.write("data", 36);
    header.writeUInt32LE(dataSize, 40);

    const data = Buffer.alloc(dataSize);
    data.fill(128); // 8-bit WAV silence is 128 (0x80)

    return Buffer.concat([header, data]).toString('base64');
  };

  const wavBase64 = makeSilenceWav(1);
  
  try {
    console.log("\nTest 2: Testing Audio triage parsing via Gemini...");
    const res = await fetch(`${baseUrl}/triage/voice-parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio: wavBase64,
        mimeType: 'audio/wav',
        langHint: 'en-US'
      })
    });

    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
    if (res.ok) {
      console.log("✅ Test 2 Passed!");
    } else {
      console.error("❌ Test 2 Failed!");
    }
  } catch (err) {
    console.error("❌ Test 2 Exception:", err);
  }
};

runTests();
