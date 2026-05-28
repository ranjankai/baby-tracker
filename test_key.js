import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI("AIzaSyB6KD8_AKcZc28iqesXKnR6HHFsykRrQds");

async function test() {
  const prompt = "Hello";
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite", generationConfig: { responseMimeType: "text/plain" } });
  try {
    const result = await model.generateContent(prompt);
    console.log("Success:", result.response.text());
  } catch(e) {
    console.error("Failed:", e.message);
  }
}
test();
