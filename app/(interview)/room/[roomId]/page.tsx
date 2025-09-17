'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Toaster } from 'sonner'
import { saveData, uploadToBlob } from '@/lib/actions/interview-actions'
import detectionSystem, { DetectionEvent } from '@/lib/detection'

export default function RoomPage() {
  const params = useParams()
  const router = useRouter()
  const roomId = params.roomId as string

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null)
  
  // States
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [recording, setRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null)
  const [events, setEvents] = useState<DetectionEvent[]>([])
  const [integrityScore, setIntegrityScore] = useState(100)
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [detectionInitialized, setDetectionInitialized] = useState(false)
  const [candidateName, setCandidateName] = useState('Unknown Candidate')

  // Detection interval ref
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Get camera access
  const initializeCamera = async () => {
    try {
      console.log('📹 Camera access request kar rahe hain...')
      
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: 1280, 
          height: 720,
          facingMode: 'user'
        }, 
        audio: true 
      })
      
      setStream(mediaStream)
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        console.log('✅ Video stream set ho gya')
      }
      
    } catch (error) {
      console.error('❌ Camera access nahi mila:', error)
      alert('Please allow camera and microphone access to continue')
    }
  }

  // Initialize detection system
  const initializeDetection = async () => {
    try {
      console.log('🔧 Detection system initialize kar rahe hain...')
      setDetectionInitialized(false) // Reset state
      
      // Set timeout to prevent infinite loading
      const timeout = setTimeout(() => {
        console.warn('⚠️ Detection initialization timeout, proceeding anyway...')
        setDetectionInitialized(true)
      }, 15000) // 15 seconds timeout
      
      const success = await detectionSystem.initialize()
      
      clearTimeout(timeout) // Clear timeout if successful
      
      if (success) {
        console.log('✅ Detection system initialized successfully!')
      } else {
        console.warn('⚠️ Detection system had issues but continuing...')
      }
      
      setDetectionInitialized(true)
      
      // Set event callback
      detectionSystem.setEventCallback((event: DetectionEvent) => {
        console.log('📝 New detection event:', event)
        
        setEvents(prev => [...prev, event])
        
        // Deduct score based on event type
        let deduction = 0
        switch (event.type) {
          case 'FOCUS_LOST':
            deduction = 5
            break
          case 'NO_FACE':
            deduction = 10
            break
          case 'MULTIPLE_FACES':
            deduction = 15
            break
          case 'PHONE_DETECTED':
            deduction = 20
            break
          case 'NOTES_DETECTED':
            deduction = 15
            break
          case 'BOOK_DETECTED':
            deduction = 15
            break
        }
        
        setIntegrityScore(prev => Math.max(0, prev - deduction))
        console.log(`📊 Score deducted: ${deduction}`)
      })
      
    } catch (error) {
      console.error('❌ Detection initialization error:', error)
      // Don't let detection failure block the UI
      setDetectionInitialized(true)
    }
  }

  // Start detection loop
  const startDetectionLoop = () => {
    if (!videoRef.current || !detectionInitialized) {
      console.warn('⚠️ Video ref ya detection system ready nahi hai')
      return
    }

    console.log('🔄 Detection loop start ho raha hai...')
    
    detectionIntervalRef.current = setInterval(async () => {
      if (videoRef.current && recording) {
        await detectionSystem.runDetection(videoRef.current)
      }
    }, 2000) // Every 2 seconds detection
  }

  // Stop detection loop
  const stopDetectionLoop = () => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current)
      detectionIntervalRef.current = null
      console.log('🛑 Detection loop stopped')
    }
  }

  // Start interview
  const startInterview = () => {
    if (!stream) {
      alert('Please wait for camera to initialize')
      return
    }

    // Don't block interview start if detection is still loading
    console.log('🎬 Interview start ho raha hai...')
    
    // Start recording
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9'
    })
    
    let recordedChunks: Blob[] = []

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data)
        console.log('📹 Video chunk recorded')
      }
    }

    recorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' })
      setVideoBlob(blob)
      console.log('✅ Recording stopped, video blob ready')
    }

    recorder.start(1000) // Collect data every second
    setMediaRecorder(recorder)
    setRecording(true)
    setStartTime(new Date())
    
    // Start detection if ready, otherwise continue without it
    if (detectionInitialized) {
      startDetectionLoop()
      console.log('🔄 Detection started with interview')
    } else {
      console.warn('⚠️ Starting interview without detection (still loading)')
      // Try to start detection anyway after a delay
      setTimeout(() => {
        if (detectionInitialized) {
          startDetectionLoop()
          console.log('🔄 Detection started after delay')
        }
      }, 5000)
    }
    
    console.log('✅ Interview started successfully!')
  }

  // End interview
  const endInterview = async () => {
    console.log('🏁 Interview end kar rahe hain...')
    
    // Stop recording
    if (mediaRecorder) {
      mediaRecorder.stop()
      setRecording(false)
    }

    // Stop detection
    stopDetectionLoop()

    const endTime = new Date()

    // Wait for video blob to be ready
    setTimeout(async () => {
      try {
        // Upload video if available
        if (videoBlob) {
          console.log('📤 Video upload kar rahe hain...')
          const formData = new FormData()
          formData.append('video', videoBlob, `interview-${roomId}.webm`)
          formData.append('roomId', roomId)
          formData.append('fileType', 'video')
          
          const uploadResult = await uploadToBlob(formData)
          console.log('Video upload result:', uploadResult)
        }

        // Save interview data
        if (startTime) {
          console.log('💾 Interview data save kar rahe hain...')
          
          const interviewData = {
            roomId,
            candidateName,
            startTime,
            endTime,
            integrityScore,
            events
          }
          
          const saveResult = await saveData(interviewData)
          console.log('Data save result:', saveResult)
        }

        console.log('✅ Interview successfully ended!')
        
        // Redirect to dashboard
        router.push('/admin/dashboard')
        
      } catch (error) {
        console.error('❌ Error ending interview:', error)
      }
    }, 2000) // Wait 2 seconds for video blob
  }

  // Initialize everything on component mount
  useEffect(() => {
    const init = async () => {
      await initializeCamera()
      await initializeDetection()
    }
    
    init()

    // Cleanup on unmount
    return () => {
      stopDetectionLoop()
      detectionSystem.destroy()
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // Get candidate name from localStorage or URL params
  useEffect(() => {
    const storedName = localStorage.getItem('candidateName')
    if (storedName) {
      setCandidateName(storedName)
      localStorage.removeItem('candidateName') // Clear after use
    }
  }, [])

  return (
    <>
      <Toaster 
        position="top-center" 
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1f2937',
            color: '#fff',
            border: '1px solid #374151'
          }
        }} 
      />
      
      <div className="min-h-screen bg-slate-900 text-white p-4">
        <div className="max-w-6xl mx-auto">
          
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">Interview Room</h1>
              <p className="text-gray-400">Candidate: {candidateName}</p>
              <p className="text-gray-400">Room ID: {roomId}</p>
            </div>
            
            <div className="flex gap-3">
              <Badge variant={recording ? "destructive" : "secondary"}>
                {recording ? 'Recording' : 'Ready'}
              </Badge>
              <Badge variant="outline">
                Score: {integrityScore}/100
              </Badge>
              <Badge variant="outline">
                Events: {events.length}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* Main Video Area */}
            <div className="lg:col-span-3">
              <Card className="p-4 bg-slate-800 border-slate-700">
                <div className="aspect-video bg-black rounded-lg overflow-hidden">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                </div>
                
                {/* Status indicators */}
                <div className="mt-4 flex gap-2">
                  <Badge variant={stream ? "default" : "secondary"}>
                    Camera: {stream ? 'Connected' : 'Disconnected'}
                  </Badge>
                  <Badge variant={detectionInitialized ? "default" : "secondary"}>
                    Detection: {detectionInitialized ? 'Ready' : 'Loading'}
                  </Badge>
                </div>
              </Card>
            </div>

            {/* Controls Panel */}
            <div className="space-y-4">
              
              {/* Interview Controls */}
              <Card className="p-4 bg-slate-800 border-slate-700">
                <h3 className="font-semibold mb-3">Interview Controls</h3>
                
                <div className="space-y-3">
                  {!stream && (
                    <Button 
                      onClick={initializeCamera}
                      className="w-full"
                      disabled={!!stream}
                    >
                      Initialize Camera
                    </Button>
                  )}
                  
                  {stream && !recording && (
                    <Button 
                      onClick={startInterview}
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      Start Interview
                      {!detectionInitialized && (
                        <span className="ml-2 text-xs opacity-75">(Detection loading...)</span>
                      )}
                    </Button>
                  )}
                  
                  {recording && (
                    <Button 
                      onClick={endInterview}
                      className="w-full bg-red-600 hover:bg-red-700"
                    >
                      End Interview
                    </Button>
                  )}
                </div>
              </Card>

              {/* Recent Events */}
              <Card className="p-4 bg-slate-800 border-slate-700">
                <h3 className="font-semibold mb-3">Recent Events</h3>
                
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {events.length === 0 ? (
                    <p className="text-sm text-gray-400">No events detected</p>
                  ) : (
                    events.slice(-5).reverse().map((event, index) => (
                      <div 
                        key={index} 
                        className="text-xs bg-red-900/50 p-2 rounded border border-red-800"
                      >
                        <div className="font-medium">{event.type.replace('_', ' ')}</div>
                        <div className="text-gray-300">
                          {event.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              {/* Interview Stats */}
              <Card className="p-4 bg-slate-800 border-slate-700">
                <h3 className="font-semibold mb-3">Statistics</h3>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Integrity Score:</span>
                    <span className="font-medium">{integrityScore}/100</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Events:</span>
                    <span className="font-medium">{events.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Focus Lost:</span>
                    <span className="font-medium">
                      {events.filter(e => e.type === 'FOCUS_LOST').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Objects Detected:</span>
                    <span className="font-medium">
                      {events.filter(e => ['PHONE_DETECTED', 'NOTES_DETECTED', 'BOOK_DETECTED'].includes(e.type)).length}
                    </span>
                  </div>
                </div>
              </Card>
              
            </div>
          </div>
        </div>
      </div>
    </>
  )
}