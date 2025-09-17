'use client'

import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'
import * as tf from "@tensorflow/tfjs";
import { load as cocoSsdLoad } from '@tensorflow-models/coco-ssd'
import { toast } from 'sonner'

// Detection events ke types
export type DetectionEventType = 
  | 'FOCUS_LOST' 
  | 'NO_FACE' 
  | 'MULTIPLE_FACES' 
  | 'PHONE_DETECTED' 
  | 'NOTES_DETECTED' 
  | 'BOOK_DETECTED'

export interface DetectionEvent {
  type: DetectionEventType
  timestamp: Date
  confidence: number
}

class DetectionSystem {
  private faceDetector: FaceDetector | null = null
  private objectDetector: any = null
  private isInitialized = false
  
  // Timing variables
  private lastFaceDetectedTime = Date.now()
  private lastLookingAwayTime = Date.now()
  private isLookingAway = false
  private hasNoFace = false
  
  // Event callback
  private onDetectionEvent: ((event: DetectionEvent) => void) | null = null
  
  // Thresholds
  private readonly FOCUS_LOST_THRESHOLD = 5000 // 5 seconds
  private readonly NO_FACE_THRESHOLD = 10000 // 10 seconds
  private readonly FACE_CENTER_THRESHOLD = 0.3 // 30% deviation from center

  async initialize(): Promise<boolean> {
    try {
      console.log('🚀 Detection system initialize ho raha hai...')
      
      // MediaPipe Face Detection initialize karo
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
      )
      
      this.faceDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
        minSuppressionThreshold: 0.3
      })
      
      console.log('✅ MediaPipe Face Detector loaded successfully')
      
      // TensorFlow COCO-SSD Object Detection initialize karo
      this.objectDetector = await cocoSsdLoad()
      console.log('✅ TensorFlow COCO-SSD Object Detector loaded successfully')
      
      this.isInitialized = true
      return true
      
    } catch (error) {
      console.error('❌ Detection system initialize nahi hua:', error)
      return false
    }
  }

  setEventCallback(callback: (event: DetectionEvent) => void) {
    this.onDetectionEvent = callback
  }

  private triggerEvent(type: DetectionEventType, confidence: number = 0.8) {
    const event: DetectionEvent = {
      type,
      timestamp: new Date(),
      confidence
    }
    
    console.log(`🔔 Detection Event: ${type} at ${event.timestamp.toLocaleTimeString()}`)
    
    if (this.onDetectionEvent) {
      this.onDetectionEvent(event)
    }
    
    // Toast notifications
    this.showToastForEvent(type)
  }

  private showToastForEvent(type: DetectionEventType) {
    switch (type) {
      case 'FOCUS_LOST':
        toast.error('Focus lost - Please look at the screen')
        break
      case 'NO_FACE':
        toast.error('No face detected - Please stay in front of camera')
        break
      case 'MULTIPLE_FACES':
        toast.error('Multiple faces detected - Only candidate should be visible')
        break
      case 'PHONE_DETECTED':
        toast.error('Phone detected - Please remove mobile device')
        break
      case 'NOTES_DETECTED':
        toast.error('Notes/Paper detected - Please remove any notes')
        break
      case 'BOOK_DETECTED':
        toast.error('Book detected - Please remove any books')
        break
    }
  }

  async detectFaces(video: HTMLVideoElement): Promise<void> {
    if (!this.faceDetector || !this.isInitialized) {
      console.warn('⚠️ Face detector abhi ready nahi hai')
      return
    }

    try {
      const detections = await this.faceDetector.detectForVideo(video, performance.now())
      const faces = detections.detections
      
      console.log(`👁️ Face Detection: ${faces.length} faces found`)
      
      const now = Date.now()
      
      if (faces.length === 0) {
        // No face detected
        if (!this.hasNoFace) {
          this.lastFaceDetectedTime = now
          this.hasNoFace = true
          console.log('⚠️ No face detected, timer started')
        }
        
        // Check if no face for too long
        if (now - this.lastFaceDetectedTime > this.NO_FACE_THRESHOLD) {
          this.triggerEvent('NO_FACE', 0.9)
          this.lastFaceDetectedTime = now // Reset timer
        }
        
      } else if (faces.length === 1) {
        // Single face detected - good!
        this.hasNoFace = false
        const face = faces[0]
        
        console.log(`😊 Single face detected with confidence: ${face.categories[0].score.toFixed(2)}`)
        
        // Check if looking at center (focus detection)
        const isLookingAtCenter = this.isFaceLookingAtCenter(face, video)
        
        if (!isLookingAtCenter) {
          if (!this.isLookingAway) {
            this.lastLookingAwayTime = now
            this.isLookingAway = true
            console.log('👀 User looking away, timer started')
          }
          
          // Check if looking away for too long
          if (now - this.lastLookingAwayTime > this.FOCUS_LOST_THRESHOLD) {
            this.triggerEvent('FOCUS_LOST', 0.8)
            this.lastLookingAwayTime = now // Reset timer
          }
        } else {
          this.isLookingAway = false
        }
        
      } else {
        // Multiple faces detected
        console.log('🚨 Multiple faces detected!')
        this.triggerEvent('MULTIPLE_FACES', 0.9)
      }
      
    } catch (error) {
      console.error('❌ Face detection error:', error)
    }
  }

  private isFaceLookingAtCenter(face: any, video: HTMLVideoElement): boolean {
    const boundingBox = face.boundingBox
    const faceCenterX = boundingBox.originX + boundingBox.width / 2
    const videoCenterX = video.videoWidth / 2
    
    const deviationRatio = Math.abs(faceCenterX - videoCenterX) / video.videoWidth
    const isLookingAtCenter = deviationRatio < this.FACE_CENTER_THRESHOLD
    
    console.log(`🎯 Face center deviation: ${(deviationRatio * 100).toFixed(1)}% (threshold: ${this.FACE_CENTER_THRESHOLD * 100}%)`)
    
    return isLookingAtCenter
  }

  async detectObjects(video: HTMLVideoElement): Promise<void> {
    if (!this.objectDetector || !this.isInitialized) {
      console.warn('⚠️ Object detector abhi ready nahi hai')
      return
    }

    try {
      const predictions = await this.objectDetector.detect(video)
      
      console.log(`📱 Object Detection: ${predictions.length} objects found`)
      
      for (const prediction of predictions) {
        const objectClass = prediction.class.toLowerCase()
        const confidence = prediction.score
        
        console.log(`🔍 Detected: ${objectClass} (${(confidence * 100).toFixed(1)}% confidence)`)
        
        // Check for prohibited items
        if (objectClass.includes('phone') || objectClass.includes('cell phone')) {
          this.triggerEvent('PHONE_DETECTED', confidence)
        }
        else if (objectClass.includes('book')) {
          this.triggerEvent('BOOK_DETECTED', confidence)
        }
        // Note: COCO-SSD might not directly detect "notes" but we can check for paper, etc.
        else if (objectClass.includes('paper') || objectClass.includes('notebook')) {
          this.triggerEvent('NOTES_DETECTED', confidence)
        }
      }
      
    } catch (error) {
      console.error('❌ Object detection error:', error)
    }
  }

  async runDetection(video: HTMLVideoElement): Promise<void> {
    if (!this.isInitialized) {
      console.warn('⚠️ Detection system abhi initialize nahi hua')
      return
    }

    // Run both detections
    await Promise.all([
      this.detectFaces(video),
      this.detectObjects(video)
    ])
  }

  destroy() {
    console.log('🛑 Detection system destroy ho raha hai...')
    if (this.faceDetector) {
      this.faceDetector.close()
      this.faceDetector = null
    }
    this.objectDetector = null
    this.isInitialized = false
  }
}

// Singleton instance export karo
const detectionSystem = new DetectionSystem()
export default detectionSystem