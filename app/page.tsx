"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const iceServers = [
  { urls: "stun:iztalk.ai:3478" },
  {
    urls: "turn:turn.iztalk.ai:3478",
    username: "iztalk",
    credential: "dVizUzU1DogQ7kg94GH1XqvzTPUxb2",
  },
];

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState("Ready to start");
  const [chatMessages, setChatMessages] = useState([]);
  const chatEndRef = useRef(null);
  const pc = useRef(null);
  const dataChannel = useRef(null);
  const remoteAudio = useRef(null);
  const localStream = useRef(null);

const prompt = `You are a professional real-time interpreter in a bilingual conversation.

- I will speak Vietnamese.
- The other person will speak English.
- Your task is to:
  • Translate my Vietnamese speech into natural, fluent English.
  • Translate the other person's English speech into natural, fluent Vietnamese.

Important rules:
- Only translate what is actually said. Do not guess, elaborate, or add extra information.
- Do not reply or comment beyond the translation.
- Do not engage in conversation. Only act as a translator.`;

const prompt2 = `You are an intelligent and helpful virtual assistant.

Your responsibilities:
- Answer my questions clearly, accurately, and concisely.
- Carefully follow the conversation context across all messages.
- Ensure your answers remain consistent and on-topic.
- Do NOT switch topics unless I explicitly change the subject.

Critical rules:
- Do NOT respond or say anything after receiving this instruction.
- Wait silently until I ask the first question — I will always speak first.
- Do NOT invent information or speculate.
- Only respond based on what I ask. Stay focused, logical, and helpful.`;

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const handleStartStop = async () => {
    if (!isConnected) {
      setStatus("🎤 Requesting microphone...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("✅ Microphone access granted");
      localStream.current = stream;

      pc.current = new RTCPeerConnection({ iceServers });
      stream.getTracks().forEach((track) => pc.current.addTrack(track, stream));
      console.log("📡 Added local audio track to PeerConnection");

      dataChannel.current = pc.current.createDataChannel("oai-events");
      console.log("📨 Created dataChannel");

      dataChannel.current.onopen = () => {
        console.log("✅ dataChannel open");
        const event = {
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: prompt2,
              }
            ]
          },
        };
        setTimeout(() => {
          dataChannel.current.send(JSON.stringify(event));
        }, 800);
        console.log("📤 Sent conversation.item.create", event);

        setIsConnected(true);
        setIsListening(true);
        setStatus("✅ Connected - Listening...");
      };

      dataChannel.current.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        console.log("📥 Received message", msg);

        // Hiển thị lời nói của người dùng (transcription từ audio)
        if (msg.type === "input_audio_transcription.final") {
          const text = msg.text;
          if (text?.trim()) {
            console.log("👤 Final transcription:", text);
            setChatMessages((prev) => {
              const updated = [
                ...prev,
                { type: "user", text, timestamp: new Date() },
              ];
              console.log("📝 Updated chatMessages (user):", updated);
              return updated;
            });

            const createPayload = {
              type: "response.create",
              response: {
                modalities: ["audio", "text"],
              },
            };
            dataChannel.current.send(JSON.stringify(createPayload));
            console.log("📤 Sent response.create", createPayload);
          }
        }

        // AI trả lời từng phần (delta)
        if (msg.type === "response.audio_transcript.done" && msg.transcript) {
          setChatMessages((prev) => {
            const updated = [
              ...prev,
              { type: "ai", text: msg.transcript, timestamp: new Date() },
            ];
            console.log("📝 Updated chatMessages (AI-delta):", updated);
            return updated;
          });
        }

        // AI trả lời đoạn hoàn chỉnh
        if (msg.type === "response.text.final" && msg.text) {
          const text = msg.text;
          if (text?.trim()) {
            console.log("🤖 AI reply (final):", text);
            setChatMessages((prev) => {
              const updated = [
                ...prev,
                { type: "ai", text, timestamp: new Date() },
              ];
              console.log("📝 Updated chatMessages (AI-final):", updated);
              return updated;
            });
          }
        }

        // Nếu muốn hiển thị transcript tiếng Anh của phản hồi giọng nói
        if (msg.type === "response.audio_transcript.delta" && msg.delta?.text) {
          const text = msg.delta.text;
          console.log("🗣️ AI voice transcript (EN):", text);
          // Tùy chọn hiển thị nếu bạn muốn
          // setChatMessages(prev => [...prev, { type: "ai-voice", text, timestamp: new Date() }])
        }
      };

      pc.current.ontrack = (event) => {
        console.log("🔊 Received remote track");
        remoteAudio.current.srcObject = event.streams[0];
      };

      setStatus("🔐 Fetching OpenAI token...");
      const tokenRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      const { token } = await tokenRes.json();
      console.log("🔑 Got token", token);

      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      console.log("📨 Created offer", offer);

      setStatus("🔁 Exchanging SDP...");
      const sdpRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/webrtc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: offer.sdp, token }),
      });
      const { sdp: answerSdp } = await sdpRes.json();
      console.log("📥 Received answer SDP", answerSdp);
      await pc.current.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } else {
      setIsConnected(false);
      setIsListening(false);
      setStatus("Disconnected");
      dataChannel.current?.close();
      pc.current?.close();
    }
  };

  const getStatusColor = () => {
    if (status.includes("✅")) return "bg-green-100 text-green-800";
    if (status.includes("❌")) return "bg-red-100 text-red-800";
    if (status.includes("Connecting") || status.includes("🔁"))
      return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-800";
  };

  useEffect(() => {
    console.log("Chat messages updated:", chatMessages);
  }, [chatMessages?.length]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-3">
            <span className="text-3xl">🎙</span>
            OpenAI Realtime Assistant
          </h1>
        </div>

        <Card className="mb-6 shadow-lg">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl text-gray-700">
              Realtime Control
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <Button
              onClick={handleStartStop}
              size="lg"
              className={`w-full h-14 text-lg font-semibold transition-all duration-300 ${
                isConnected
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "bg-green-500 hover:bg-green-600 text-white"
              }`}
            >
              {isConnected ? "🛑 Stop Realtime" : "▶️ Start Realtime"}
            </Button>

            <div className="flex justify-center">
              <Badge
                className={`px-4 py-2 text-sm font-medium ${getStatusColor()}`}
              >
                {status}
              </Badge>
            </div>

            {isListening && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span>Microphone Active</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg text-gray-700 flex items-center gap-2">
              💬 Conversation Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 overflow-y-auto bg-gray-50 rounded-lg p-4 space-y-3">
              {chatMessages.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <p>Coversation history will appear here...</p>
                  <p className="text-sm mt-2">
                    Start speaking to begin conversations
                  </p>
                </div>
              ) : (
                chatMessages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex gap-3 ${
                      message.type === "user"
                        ? "justify-start"
                        : "justify-start"
                    }`}
                  >
                    <div className="flex-shrink-0 text-2xl">
                      {message.type === "user" ? "👤" : "🤖"}
                    </div>
                    <div
                      className={`max-w-[80%] p-3 rounded-lg ${
                        message.type === "user"
                          ? "bg-blue-100 text-blue-900"
                          : "bg-green-100 text-green-900"
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{message.text}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-6 text-sm text-gray-500">
          <p>Powered by OpenAI Realtime API & WebRTC</p>
          <p className="mt-1">
            🔒 Your conversations are processed in real-time
          </p>
        </div>

        <audio ref={remoteAudio} autoPlay hidden />
      </div>
    </div>
  );
}
