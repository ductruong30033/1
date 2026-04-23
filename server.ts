import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { OpenAI } from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route cho Gemini Proxy
  app.post("/api/ai/gemini", async (req, res) => {
    const { message, history, systemInstruction, imageBase64, apiKey, model: userModel } = req.body;
    try {
      let activeKey = apiKey || process.env.GEMINI_API_KEY;
      
      // Kiểm tra nếu key là placeholder hoặc trống
      if (!activeKey || activeKey === "MY_GEMINI_API_KEY" || activeKey.trim() === "") {
        return res.status(401).json({ 
          error: "API Key Gemini không hợp lệ hoặc chưa được cấu hình. Vui lòng kiểm tra lại trong phần Cài đặt của ứng dụng hoặc Secrets của AI Studio." 
        });
      }
      
      const genAI = new GoogleGenerativeAI(activeKey);
      
      const model = genAI.getGenerativeModel({
        model: userModel || (imageBase64 ? "gemini-1.5-flash" : "gemini-1.5-pro"), 
        systemInstruction: systemInstruction,
        tools: [
          {
            googleSearchRetrieval: {
              dynamicRetrievalConfig: {
                mode: "MODE_DYNAMIC",
                dynamicThreshold: 0.3,
              },
            },
          },
          {
            functionDeclarations: [
              {
                name: "create_temp_email",
                description: "Tạo mail tạm thời mới",
                parameters: { type: "object", properties: {} }
              },
              {
                name: "check_temp_email_inbox",
                description: "Kiểm tra hòm thư",
                parameters: { type: "object", properties: {} }
              }
            ]
          }
        ] as any
      });

      let responseStream;
      if (imageBase64) {
        // Multi-modal message
        const promptParts = [
          { text: message },
          { inlineData: { mimeType: "image/jpeg", data: imageBase64.split(',')[1] || imageBase64 } }
        ];
        // For vision, we usually don't use history in the same way or Flash handles it differently
        // Simple vision response for now
        responseStream = await model.generateContentStream(promptParts as any[]);
      } else {
        const chat = model.startChat({
          history: history.map((h: any) => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.parts }]
          }))
        });
        responseStream = await chat.sendMessageStream(message);
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      for await (const chunk of responseStream.stream) {
        const calls = chunk.functionCalls();
        if (calls && calls.length > 0) {
           res.write(`data: ${JSON.stringify({ tool_calls: calls })}\n\n`);
        }
        try {
          const text = chunk.text();
          if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
        } catch (e) {}
      }
      res.end();
    } catch (error: any) {
      console.error('Gemini Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route chung cho OpenAI-compatible (OpenAI, DeepSeek, Groq, Custom...)
  app.post("/api/ai/openai", async (req, res) => {
    const { apiKey, model, messages, baseURL } = req.body;
    try {
      const openai = new OpenAI({ 
        apiKey, 
        baseURL: baseURL || "https://api.openai.com/v1"
      });
      const stream = await openai.chat.completions.create({
        model: model,
        messages: messages,
        stream: true,
      });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.end();
    } catch (error: any) {
      console.error('AI Proxy Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route cho Anthropic Proxy
  app.post("/api/ai/anthropic", async (req, res) => {
    const { apiKey, model, messages, system } = req.body;
    try {
      const anthropic = new Anthropic({ apiKey });
      const stream = await anthropic.messages.create({
        model: model,
        system: system,
        messages: messages,
        max_tokens: 4096,
        stream: true,
      });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.end();
    } catch (error: any) {
      console.error('Anthropic Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: 3000 },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
