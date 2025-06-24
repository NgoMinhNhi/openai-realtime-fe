"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"



const iceServers = [
  { urls: "stun:iztalk.ai:3478" },
  {
    urls: "turn:turn.iztalk.ai:3478",
    username: "iztalk",
    credential: "dVizUzU1DogQ7kg94GH1XqvzTPUxb2"
  }
]

export default function App() {
  const [isConnected, setIsConnected] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [status, setStatus] = useState("Ready to start")
  const [chatMessages, setChatMessages] = useState([])
  const chatEndRef = useRef(null)
  const pc = useRef(null)
  const dataChannel = useRef(null)
  const remoteAudio = useRef(null)
  const localStream = useRef(null)

  const prompt = ``

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatMessages])

  const handleStartStop = async () => {
    if (!isConnected) {
      setStatus("🎤 Requesting microphone...")
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      console.log("✅ Microphone access granted")
      localStream.current = stream

      pc.current = new RTCPeerConnection({ iceServers })
      stream.getTracks().forEach(track => pc.current.addTrack(track, stream))
      console.log("📡 Added local audio track to PeerConnection")

      dataChannel.current = pc.current.createDataChannel("oai-events")
      console.log("📨 Created dataChannel")

      dataChannel.current.onopen = () => {
        console.log("✅ dataChannel open")

        const updatePayload = {
          type: "session.update",
          session: {
            instructions: prompt,
            input_audio_transcription: { model: "whisper-1" },
            voice: { id: "nova" },
            modalities: ["audio", "text"]
          }
        }
        dataChannel.current.send(JSON.stringify(updatePayload))
        console.log("📤 Sent session.update", updatePayload)

        setIsConnected(true)
        setIsListening(true)
        setStatus("✅ Connected - Listening...")
      }

dataChannel.current.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  console.log("📥 Received message", JSON.stringify(msg))

  // Hiển thị lời nói của người dùng (transcription từ audio)
  if (msg.type === "input_audio_transcription.final") {
    const text = msg.text
    if (text?.trim()) {
      console.log("👤 Final transcription:", text)
      setChatMessages(prev => {
        const updated = [...prev, { type: "user", text, timestamp: new Date() }]
        console.log("📝 Updated chatMessages (user):", updated)
        return updated
      })

      const createPayload = {
        type: "response.create",
        response: {
          modalities: ["audio", "text"]
        }
      }
      dataChannel.current.send(JSON.stringify(createPayload))
      console.log("📤 Sent response.create", createPayload)
    }
  }

  // AI trả lời từng phần (delta)
  if (msg.type === "response.audio_transcript.done" && msg.transcript) {
      setChatMessages(prev => {
        const updated = [...prev, { type: "ai", text: msg.transcript, timestamp: new Date() }]
        console.log("📝 Updated chatMessages (AI-delta):", updated)
        return updated
      })
  }

  // AI trả lời đoạn hoàn chỉnh
  if (msg.type === "response.text.final" && msg.text) {
    const text = msg.text
    if (text?.trim()) {
      console.log("🤖 AI reply (final):", text)
      setChatMessages(prev => {
        const updated = [...prev, { type: "ai", text, timestamp: new Date() }]
        console.log("📝 Updated chatMessages (AI-final):", updated)
        return updated
      })
    }
  }

  // Nếu muốn hiển thị transcript tiếng Anh của phản hồi giọng nói
  if (msg.type === "response.audio_transcript.delta" && msg.delta?.text) {
    const text = msg.delta.text
    console.log("🗣️ AI voice transcript (EN):", text)
    // Tùy chọn hiển thị nếu bạn muốn
    // setChatMessages(prev => [...prev, { type: "ai-voice", text, timestamp: new Date() }])
  }
}


      pc.current.ontrack = (event) => {
        console.log("🔊 Received remote track")
        remoteAudio.current.srcObject = event.streams[0]
      }

      setStatus("🔐 Fetching OpenAI token...")
      const tokenRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      })
      const { token } = await tokenRes.json()
      console.log("🔑 Got token", token)

      const offer = await pc.current.createOffer()
      await pc.current.setLocalDescription(offer)
      console.log("📨 Created offer", offer)

      setStatus("🔁 Exchanging SDP...")
      const sdpRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/webrtc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: offer.sdp, token })
      })
      const { sdp: answerSdp } = await sdpRes.json()
      console.log("📥 Received answer SDP", answerSdp)
      await pc.current.setRemoteDescription({ type: "answer", sdp: answerSdp })
    } else {
      setIsConnected(false)
      setIsListening(false)
      setStatus("Disconnected")
      dataChannel.current?.close()
      pc.current?.close()
    }
  }

  const getStatusColor = () => {
    if (status.includes("✅")) return "bg-green-100 text-green-800"
    if (status.includes("❌")) return "bg-red-100 text-red-800"
    if (status.includes("Connecting") || status.includes("🔁")) return "bg-yellow-100 text-yellow-800"
    return "bg-gray-100 text-gray-800"
  }

  useEffect(() => {
    console.log("Chat messages updated:", chatMessages)
  }, [chatMessages?.length])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-3">
            <span className="text-3xl">🎙</span>
            OpenAI Realtime Translator
          </h1>
          <p className="text-gray-600 text-lg">Vai trò: Phiên dịch viên realtime tiếng Việt ↔ tiếng Anh</p>
        </div>

        <Card className="mb-6 shadow-lg">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl text-gray-700">Realtime Translation Control</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <Button
              onClick={handleStartStop}
              size="lg"
              className={`w-full h-14 text-lg font-semibold transition-all duration-300 ${
                isConnected ? "bg-red-500 hover:bg-red-600 text-white" : "bg-green-500 hover:bg-green-600 text-white"
              }`}
            >
              {isConnected ? "🛑 Stop Realtime" : "▶️ Start Realtime"}
            </Button>

            <div className="flex justify-center">
              <Badge className={`px-4 py-2 text-sm font-medium ${getStatusColor()}`}>{status}</Badge>
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
            <CardTitle className="text-lg text-gray-700 flex items-center gap-2">💬 Translation Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 overflow-y-auto bg-gray-50 rounded-lg p-4 space-y-3">
              {chatMessages.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <p>Translation history will appear here...</p>
                  <p className="text-sm mt-2">Start speaking to begin translation</p>
                </div>
              ) : (
                chatMessages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex gap-3 ${message.type === "user" ? "justify-start" : "justify-start"}`}
                  >
                    <div className="flex-shrink-0 text-2xl">{message.type === "user" ? "👤" : "🤖"}</div>
                    <div
                      className={`max-w-[80%] p-3 rounded-lg ${
                        message.type === "user" ? "bg-blue-100 text-blue-900" : "bg-green-100 text-green-900"
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{message.text}</p>
                      <p className="text-xs opacity-70 mt-1">{message.timestamp.toLocaleTimeString()}</p>
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
          <p className="mt-1">🔒 Your conversations are processed in real-time</p>
        </div>

        <audio ref={remoteAudio} autoPlay hidden />
      </div>
    </div>
  )
}
