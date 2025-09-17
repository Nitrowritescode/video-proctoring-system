'use server'

import { put } from '@vercel/blob'
import jsPDF from 'jspdf'
import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'

// Types define kiye hain
export interface EventData {
  type: string
  timestamp: Date
  confidence: number
}

export interface InterviewData {
  roomId: string
  candidateName: string
  startTime: Date
  endTime?: Date
  integrityScore: number
  events: EventData[]
}

// File upload ke liye folder paths
const FOLDER_PATHS = {
  VIDEOS: 'videos',
  PDFS: 'pdfs'
} as const

const primaryColor: [number, number, number] = [30, 41, 59]
const accentColor: [number, number, number] = [239, 68, 68] 
const textColor: [number, number, number] = [51, 65, 85] 

/* ----------------------------
  1. CREATE INTERVIEW - Meeting page se room create karne ke liye
----------------------------- */
export async function createInterviewAction(formData: FormData) {
  try {
    const candidateName = formData.get('candidateName') as string

    // Validation
    if (!candidateName || candidateName.trim() === '') {
      throw new Error('Candidate name is required')
    }

    console.log('🎯 Creating new interview for:', candidateName.trim())

    const interview = await prisma.interview.create({
      data: {
        candidateName: candidateName.trim(),
        status: 'active',
      },
    })

    console.log('✅ Interview created successfully:', {
      roomId: interview.roomId,
      candidateName: interview.candidateName,
      id: interview.id
    })

    // Room page pe redirect karo
    redirect(`/room/${interview.roomId}`)

  } catch (error) {
    console.error('❌ Create interview error:', error)
    
    // Agar redirect nahi hai, toh error throw karo
    if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
      throw error 
    }
    
    throw new Error('Failed to create interview')
  }
}

/* ----------------------------
  2. SAVE INTERVIEW DATA - End call pe saara data save karne ke liye
----------------------------- */
export async function saveData(data: InterviewData) {
  try {
    console.log('💾 Saving interview data for room:', data.roomId)

    // Validation
    if (!data.roomId || !data.candidateName || !data.startTime) {
      throw new Error('Required interview data is missing')
    }

    // Duration calculate karo minutes mein
    const duration = data.endTime
      ? Math.round((data.endTime.getTime() - data.startTime.getTime()) / 60000)
      : null

    // Event counts calculate karo reporting ke liye
    const eventCounts = {
      focusLostCount: data.events.filter(e => e.type === 'FOCUS_LOST').length,
      phoneDetectedCount: data.events.filter(e => e.type === 'PHONE_DETECTED').length,
      multipleFacesCount: data.events.filter(e => e.type === 'MULTIPLE_FACES').length,
      noFaceCount: data.events.filter(e => e.type === 'NO_FACE').length,
      notesDetectedCount: data.events.filter(e => e.type === 'NOTES_DETECTED').length,
      bookDetectedCount: data.events.filter(e => e.type === 'BOOK_DETECTED').length
    }

    console.log('📊 Calculated event counts:', eventCounts)

    // Main interview record update karo
    const interview = await prisma.interview.update({
      where: { roomId: data.roomId },
      data: {
        candidateName: data.candidateName,
        endTime: data.endTime || null,
        duration,
        integrityScore: Math.max(0, Math.min(100, data.integrityScore)), // 0-100 range ensure karo
        totalEvents: data.events.length,
        ...eventCounts,
        status: data.endTime ? 'completed' : 'active',
      },
    })

    console.log('✅ Interview updated successfully:', {
      id: interview.id,
      status: interview.status,
      totalEvents: interview.totalEvents,
      integrityScore: interview.integrityScore,
      duration: interview.duration
    })

    // Purane events delete karo (cleanup for re-saves)
    const deletedEventsCount = await prisma.detectionEvent.deleteMany({
      where: { interviewId: interview.id },
    })

    if (deletedEventsCount.count > 0) {
      console.log(`🧹 Cleaned up ${deletedEventsCount.count} old events`)
    }

    // Naye events insert karo batch mein
    if (data.events.length > 0) {
      const eventsToInsert = data.events.map(event => ({
        interviewId: interview.id,
        type: event.type,
        timestamp: event.timestamp,
        confidence: Math.max(0, Math.min(1, event.confidence)), // 0-1 range ensure karo
      }))

      const insertedEvents = await prisma.detectionEvent.createMany({
        data: eventsToInsert,
        skipDuplicates: true,
      })

      console.log(`📝 Inserted ${insertedEvents.count} detection events`)
    }

    return {
      success: true,
      message: 'Interview data saved successfully',
      interviewId: interview.id,
      totalEvents: data.events.length,
      integrityScore: interview.integrityScore
    }

  } catch (error) {
    console.error('❌ Save data error:', error)
    return {
      success: false,
      error: 'Failed to save interview data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/* ----------------------------
  3. GET INTERVIEW DATA - Specific interview ka data lene ke liye
----------------------------- */
export async function getData(roomId: string) {
  try {
    console.log('🔍 Fetching data for room:', roomId)

    // Validation
    if (!roomId || roomId.trim() === '') {
      throw new Error('Room ID is required')
    }

    const interview = await prisma.interview.findUnique({
      where: { roomId: roomId.trim() },
      include: {
        events: {
          orderBy: { timestamp: 'asc' }
        },
        _count: {
          select: {
            events: true
          }
        }
      },
    })

    if (!interview) {
      console.log('❌ Interview not found for room:', roomId)
      return { 
        success: false, 
        error: 'Interview not found',
        roomId 
      }
    }

    console.log('✅ Interview data retrieved successfully:', {
      candidateName: interview.candidateName,
      totalEvents: interview._count.events,
      status: interview.status,
      integrityScore: interview.integrityScore
    })

    return { success: true, data: interview }

  } catch (error) {
    console.error('❌ Get data error:', error)
    return {
      success: false,
      error: 'Failed to retrieve interview data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/* ----------------------------
  4. FILE UPLOAD - Video aur PDF upload ke liye Vercel Blob
----------------------------- */
export async function uploadToBlob(formData: FormData) {
  try {
    const videoFile = formData.get('video') as File | null
    const pdfFile = formData.get('pdf') as File | null
    const roomId = formData.get('roomId') as string
    const fileType = formData.get('fileType') as string

    // Validation
    if (!roomId || roomId.trim() === '') {
      throw new Error('Room ID is required for upload')
    }

    if (!videoFile && !pdfFile) {
      throw new Error('At least one file is required for upload')
    }

    console.log('📤 Starting file upload for room:', roomId, {
      fileType,
      hasVideo: !!videoFile,
      hasPdf: !!pdfFile
    })

    let videoUrl = null
    let pdfUrl = null

    // Video upload karo VIDEOS folder mein
    if (videoFile && (fileType === 'video' || !fileType)) {
      const videoSize = Math.round(videoFile.size / 1024 / 1024 * 100) / 100 // MB mein
      console.log('🎥 Uploading video file:', {
        size: `${videoSize} MB`,
        type: videoFile.type
      })

      // Video file validation
      if (!videoFile.type.includes('video/')) {
        throw new Error('Invalid video file type')
      }

      if (videoFile.size > 100 * 1024 * 1024) { // 100MB limit
        throw new Error('Video file too large (max 100MB)')
      }

      const videoFilename = `${FOLDER_PATHS.VIDEOS}/interview-${roomId}-${Date.now()}.webm`
      const videoBlob = await put(videoFilename, videoFile, {
        access: 'public',
        contentType: videoFile.type,
        addRandomSuffix: false, // Filename already unique hai
      })

      videoUrl = videoBlob.url
      console.log('✅ Video uploaded successfully to:', videoFilename)

      // Database mein video URL update karo
      await prisma.interview.update({
        where: { roomId: roomId.trim() },
        data: { 
          videoUrl,
        },
      })
    }

    // PDF upload karo PDFS folder mein
    if (pdfFile && (fileType === 'pdf' || !fileType)) {
      const pdfSize = Math.round(pdfFile.size / 1024 / 1024 * 100) / 100 // MB mein
      console.log('📄 Uploading PDF file:', {
        size: `${pdfSize} MB`,
        type: pdfFile.type
      })

      // PDF file validation
      if (!pdfFile.type.includes('application/pdf')) {
        throw new Error('Invalid PDF file type')
      }

      if (pdfFile.size > 10 * 1024 * 1024) { // 10MB limit
        throw new Error('PDF file too large (max 10MB)')
      }

      const pdfFilename = `${FOLDER_PATHS.PDFS}/report-${roomId}-${Date.now()}.pdf`
      const pdfBlob = await put(pdfFilename, pdfFile, {
        access: 'public',
        contentType: 'application/pdf',
        addRandomSuffix: false, // Filename already unique hai
      })

      pdfUrl = pdfBlob.url
      console.log('✅ PDF uploaded successfully to:', pdfFilename)

      // Database mein PDF URL update karo
      await prisma.interview.update({
        where: { roomId: roomId.trim() },
        data: { 
          pdfUrl
        },
      })
    }

    return { 
      success: true, 
      videoUrl, 
      pdfUrl,
      message: 'Files uploaded successfully'
    }

  } catch (error) {
    console.error('❌ Upload error:', error)
    return {
      success: false,
      error: 'Failed to upload file',
      details: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}


/* ----------------------------
  5. PDF REPORT GENERATION - Complete report banane ke liye
----------------------------- */
export async function generatePDF(roomId: string) {
  try {
    console.log('📋 Generating PDF report for room:', roomId)

    // Validation
    if (!roomId || roomId.trim() === '') {
      throw new Error('Room ID is required for PDF generation')
    }

    // Interview data fetch karo
    const result = await getData(roomId.trim())
    if (!result.success || !result.data) {
      throw new Error('Interview data not found for PDF generation')
    }

    const interview = result.data

    // jsPDF instance create karo
    const doc = new jsPDF()

    // Colors define karo
    const colors = {
      primary: [30, 41, 59] as [number, number, number], // slate-800
      accent: [239, 68, 68] as [number, number, number], // red-500
      text: [51, 65, 85] as [number, number, number], // slate-600
      success: [34, 197, 94] as [number, number, number], // green-500
      warning: [234, 179, 8] as [number, number, number], // yellow-500
      danger: [239, 68, 68] as [number, number, number], // red-500
      gray: [156, 163, 175] as [number, number, number] // gray-400
    }

    /* HEADER SECTION */
    doc.setFillColor(...colors.primary)
    doc.rect(0, 0, 210, 35, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.text('VIDEO INTERVIEW PROCTORING REPORT', 105, 20, { align: 'center' })

    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    const reportDate = new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    const reportTime = new Date().toLocaleTimeString('en-IN')
    doc.text(`Generated on ${reportDate} at ${reportTime}`, 105, 28, { align: 'center' })

    /* CANDIDATE INFORMATION */
    let yPosition = 50
    doc.setTextColor(...colors.text)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('CANDIDATE INFORMATION', 20, yPosition)

    // Info box background
    doc.setFillColor(248, 250, 252) // gray-50
    doc.rect(20, yPosition + 5, 170, 45, 'F')
    doc.setDrawColor(...colors.gray)
    doc.rect(20, yPosition + 5, 170, 45, 'S')

    yPosition += 15
    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    doc.text(`Name: ${interview.candidateName || 'Not Provided'}`, 25, yPosition)
    yPosition += 8
    doc.text(`Room ID: ${interview.roomId}`, 25, yPosition)
    yPosition += 8

    const startDate = new Date(interview.startTime).toLocaleDateString('en-IN')
    const startTime = new Date(interview.startTime).toLocaleTimeString('en-IN')
    doc.text(`Interview Date: ${startDate}`, 25, yPosition)
    yPosition += 8
    doc.text(`Start Time: ${startTime}`, 25, yPosition)
    yPosition += 8

    if (interview.endTime) {
      const endTime = new Date(interview.endTime).toLocaleTimeString('en-IN')
      doc.text(`End Time: ${endTime}`, 25, yPosition)
      yPosition += 8
      doc.text(`Duration: ${interview.duration || 0} minutes`, 25, yPosition)
    } else {
      doc.setTextColor(...colors.warning)
      doc.text('Status: Interview in progress', 25, yPosition)
      doc.setTextColor(...colors.text)
    }

    /* INTEGRITY SCORE SECTION */
    yPosition += 25
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('INTEGRITY ASSESSMENT', 20, yPosition)

    yPosition += 15
    
    // Score determination aur color
    const score = interview.integrityScore
    const scoreColor = score >= 90 ? colors.success :
      score >= 75 ? [34, 197, 94] :
        score >= 60 ? colors.warning :
          score >= 40 ? [249, 115, 22] :
            colors.danger

    // Score circle banao
    doc.setFillColor(...(scoreColor as [number, number, number]))
    doc.circle(45, yPosition, 15, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text(`${score}`, 45, yPosition + 2, { align: 'center' })

    doc.setTextColor(...colors.text)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Final Integrity Score', 70, yPosition - 5)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    doc.text('(out of 100)', 70, yPosition + 5)

    // Score interpretation
    yPosition += 20
    const interpretation = score >= 90 ? 'Excellent - Highly trustworthy performance' :
      score >= 75 ? 'Good - Acceptable with minor concerns' :
        score >= 60 ? 'Average - Some compliance issues detected' :
          score >= 40 ? 'Poor - Multiple policy violations' :
            'Critical - Severe integrity concerns'

    doc.setFont('helvetica', 'italic')
    doc.text(`Assessment: ${interpretation}`, 20, yPosition)

    /* DETECTION SUMMARY TABLE */
    yPosition += 25
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('VIOLATION SUMMARY', 20, yPosition)

    yPosition += 15
    
    // Table header
    doc.setFillColor(241, 245, 249) // slate-100
    doc.rect(20, yPosition - 5, 170, 12, 'F')
    doc.setDrawColor(...colors.gray)
    doc.rect(20, yPosition - 5, 170, 12, 'S')
    
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...colors.text)
    doc.text('Violation Type', 25, yPosition + 2)
    doc.text('Count', 110, yPosition + 2)
    doc.text('Severity', 135, yPosition + 2)
    doc.text('Score Impact', 165, yPosition + 2)

    yPosition += 15
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)

    const violations = [
      { 
        type: 'Focus Lost (Looking Away)', 
        count: interview.focusLostCount, 
        severity: 'Medium', 
        impact: '-5 each' 
      },
      { 
        type: 'Face Not Detected', 
        count: interview.noFaceCount, 
        severity: 'High', 
        impact: '-10 each' 
      },
      { 
        type: 'Mobile Phone Detected', 
        count: interview.phoneDetectedCount, 
        severity: 'Critical', 
        impact: '-20 each' 
      },
      { 
        type: 'Books/Notes Detected', 
        count: interview.notesDetectedCount, 
        severity: 'High', 
        impact: '-15 each' 
      },
      { 
        type: 'Multiple Faces', 
        count: interview.multipleFacesCount, 
        severity: 'Critical', 
        impact: '-15 each' 
      }
    ]

    violations.forEach((violation, index) => {
      // Alternating row colors
      if (index % 2 === 0) {
        doc.setFillColor(249, 250, 251) // gray-50
        doc.rect(20, yPosition - 3, 170, 8, 'F')
      }

      doc.setTextColor(...colors.text)
      doc.text(violation.type, 25, yPosition)
      
      // Count with color coding
      const countColor = violation.count > 0 ? colors.danger : colors.success
      doc.setTextColor(...countColor)
      doc.text(violation.count.toString(), 110, yPosition)

      // Severity with color coding
      const severityColor = violation.severity === 'Critical' ? colors.danger :
        violation.severity === 'High' ? [249, 115, 22] :
          colors.warning as [number, number, number];
      doc.setTextColor(...(severityColor as [number, number, number]))
      doc.text(violation.severity, 135, yPosition)
      
      doc.setTextColor(...(colors.gray as [number, number, number]))
      doc.text(violation.impact, 165, yPosition)
      
      yPosition += 10
    })

    /* TIMELINE SECTION */
    if (interview.events && interview.events.length > 0) {
      yPosition += 20
      
      // New page check
      if (yPosition > 250) {
        doc.addPage()
        yPosition = 30
      }

      doc.setTextColor(...colors.text)
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text('EVENT TIMELINE', 20, yPosition)

      yPosition += 15
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')

      // Show recent events (last 15 for better overview)
      const recentEvents = interview.events.slice(-15)
      let eventCount = 0

      recentEvents.forEach((event) => {
        if (yPosition > 270) { // New page needed
          doc.addPage()
          yPosition = 30
          doc.setTextColor(...colors.text)
          doc.setFontSize(16)
          doc.setFont('helvetica', 'bold')
          doc.text('EVENT TIMELINE (Continued)', 20, yPosition)
          yPosition += 15
          doc.setFontSize(9)
          doc.setFont('helvetica', 'normal')
        }

        const time = new Date(event.timestamp).toLocaleTimeString('en-IN')
        const eventType = event.type.replace(/_/g, ' ')
        const confidence = Math.round(event.confidence * 100)
        
        // Event icon based on type
        const eventIcon = event.type.includes('PHONE') ? '📱' :
          event.type.includes('FACE') ? '👤' :
            event.type.includes('FOCUS') ? '👁️' :
              event.type.includes('NOTES') ? '📝' :
                '⚠️'

        doc.setTextColor(...colors.danger)
        doc.text('●', 20, yPosition)
        
        doc.setTextColor(...colors.text)
        doc.text(`${time}`, 25, yPosition)
        doc.text(`${eventType}`, 55, yPosition)
        doc.text(`(${confidence}% confidence)`, 130, yPosition)
        
        yPosition += 6
        eventCount++
      })

      if (interview.events.length > 15) {
        yPosition += 5
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(...colors.gray)
        doc.text(`... and ${interview.events.length - 15} earlier events`, 25, yPosition)
      }
    }

    /* RECOMMENDATIONS SECTION */
    yPosition += 25
    if (yPosition > 250) {
      doc.addPage()
      yPosition = 30
    }

    doc.setTextColor(...colors.text)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('RECOMMENDATIONS', 20, yPosition)

    yPosition += 15
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')

    const recommendations = score >= 85 ?
      [
        { icon: '✅', text: 'Candidate demonstrated excellent interview compliance', color: colors.success },
        { icon: '✅', text: 'Minimal supervision concerns identified', color: colors.success },
        { icon: '✅', text: 'Strongly recommended for next evaluation stage', color: colors.success }
      ] :
      score >= 70 ?
        [
          { icon: '⚠️', text: 'Candidate showed acceptable compliance with minor issues', color: colors.warning },
          { icon: '⚠️', text: 'Consider additional verification or clarification', color: colors.warning },
          { icon: '✅', text: 'Conditionally recommended for further evaluation', color: colors.success }
        ] :
        score >= 50 ?
          [
            { icon: '❌', text: 'Multiple compliance violations detected during interview', color: colors.danger },
            { icon: '❌', text: 'Recommend re-interview under enhanced monitoring', color: colors.danger },
            { icon: '⚠️', text: 'Consider alternative assessment methods if re-interview fails', color: colors.warning }
          ] :
          [
            { icon: '🚨', text: 'Critical integrity violations - Interview compromised', color: colors.danger },
            { icon: '🚨', text: 'Immediate re-assessment required under strict supervision', color: colors.danger },
            { icon: '❌', text: 'Current interview results should not be considered valid', color: colors.danger }
          ]

    recommendations.forEach(rec => {
      doc.setTextColor(...rec.color)
      doc.text(rec.icon, 25, yPosition)
      doc.text(rec.text, 35, yPosition)
      yPosition += 10
    })

    /* FOOTER */
    const pageHeight = doc.internal.pageSize.height
    doc.setFillColor(...colors.primary)
    doc.rect(0, pageHeight - 25, 210, 25, 'F')
    
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('AI-Powered Video Proctoring System', 105, pageHeight - 15, { align: 'center' })
    
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('This report is generated automatically based on real-time video analysis', 105, pageHeight - 8, { align: 'center' })

    /* SAVE AND UPLOAD PDF */
    const pdfBuffer = doc.output('arraybuffer')
    const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' })
    const pdfFileName = `interview-report-${roomId}-${Date.now()}.pdf`
    const pdfFile = new File([pdfBlob], pdfFileName, { type: 'application/pdf' })

    // Upload to PDFS folder in blob storage
    const filename = `${FOLDER_PATHS.PDFS}/${pdfFileName}`
    const uploadedBlob = await put(filename, pdfFile, {
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: false,
    })

    // Database mein PDF URL update karo
    await prisma.interview.update({
      where: { roomId: roomId.trim() },
      data: { 
        pdfUrl: uploadedBlob.url
      },
    })

    console.log('✅ PDF report generated and uploaded successfully:', {
      filename,
      url: uploadedBlob.url,
      size: `${Math.round(pdfFile.size / 1024)} KB`
    })

    return { 
      success: true, 
      pdfUrl: uploadedBlob.url,
      filename: pdfFileName,
      size: pdfFile.size
    }

  } catch (error) {
    console.error('❌ PDF generation error:', error)
    return {
      success: false,
      error: 'Failed to generate PDF report',
      details: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/* ----------------------------
  6. GET ALL INTERVIEWS - Dashboard ke liye
----------------------------- */
export async function getAllInterviews() {
  try {
    console.log('📋 Fetching all interviews for dashboard...')

    const interviews = await prisma.interview.findMany({
      orderBy: [
        { status: 'desc' }, // Active first, then completed
        { startTime: 'desc' } // Latest first within same status
      ],
      include: {
        _count: {
          select: {
            events: true
          }
        }
      }
    })

    console.log(`✅ Successfully fetched ${interviews.length} interviews`)

    // Add computed fields for better dashboard display
    const enhancedInterviews = interviews.map(interview => ({
      ...interview,
      isActive: interview.status === 'active',
      isCompleted: interview.status === 'completed',
      hasVideo: !!interview.videoUrl,
      hasPdf: !!interview.pdfUrl,
      eventCount: interview._count.events,
      durationFormatted: interview.duration ? `${interview.duration} min` : 'N/A'
    }))

    return enhancedInterviews

  } catch (error) {
    console.error("❌ Error fetching interviews:", error)
    return []
  }
}

/* ----------------------------
  7. DELETE INTERVIEW - Admin cleanup ke liye
----------------------------- */
export async function deleteInterview(roomId: string) {
  try {
    console.log('🗑️ Deleting interview and related data:', roomId)

    // Validation
    if (!roomId || roomId.trim() === '') {
      throw new Error('Room ID is required for deletion')
    }

    // Interview check karo
    const interview = await prisma.interview.findUnique({
      where: { roomId: roomId.trim() },
      include: { 
        events: true,
        _count: {
          select: { events: true }
        }
      }
    })

    if (!interview) {
      return { 
        success: false, 
        error: 'Interview not found',
        roomId 
      }
    }

    // Database transaction mein delete karo
    await prisma.$transaction(async (tx) => {
      // First delete all events
      await tx.detectionEvent.deleteMany({
        where: { interviewId: interview.id }
      })

      // Then delete interview
      await tx.interview.delete({
        where: { roomId: roomId.trim() }
      })
    })

    console.log('✅ Interview deleted successfully:', {
      roomId: interview.roomId,
      candidateName: interview.candidateName,
      deletedEvents: interview._count.events
    })

    return { 
      success: true, 
      message: 'Interview and all related data deleted successfully',
      deletedEvents: interview._count.events
    }

  } catch (error) {
    console.error('❌ Delete interview error:', error)
    return { 
      success: false, 
      error: 'Failed to delete interview',
      details: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/* ----------------------------
  8. UPDATE INTERVIEW STATUS - Status change ke liye
----------------------------- */
export async function updateInterviewStatus(roomId: string, status: 'active' | 'completed' | 'cancelled') {
  try {
    console.log(`🔄 Updating interview status: ${roomId} -> ${status}`)

    // Validation
    if (!roomId || roomId.trim() === '') {
      throw new Error('Room ID is required for status update')
    }

    if (!['active', 'completed', 'cancelled'].includes(status)) {
      throw new Error('Invalid status value')
    }

    const updateData: any = {
      status,
      updatedAt: new Date()
    }

    // Agar completed hai toh endTime set karo
    if (status === 'completed') {
      updateData.endTime = new Date()
    }

    const interview = await prisma.interview.update({
      where: { roomId: roomId.trim() },
      data: updateData,
    })

    console.log('✅ Interview status updated successfully:', {
      roomId: interview.roomId,
      oldStatus: interview.status,
      newStatus: status,
      endTime: updateData.endTime
    })

    return { 
      success: true, 
      interview,
      message: `Interview status updated to ${status}`
    }

  } catch (error) {
    console.error('❌ Status update error:', error)
    return { 
      success: false, 
      error: 'Failed to update interview status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/* ----------------------------
  9. BULK OPERATIONS - Multiple interviews ke liye
----------------------------- */
export async function bulkDeleteInterviews(roomIds: string[]) {
  try {
    console.log('🗑️ Bulk deleting interviews:', roomIds.length)

    // Validation
    if (!roomIds || roomIds.length === 0) {
      throw new Error('Room IDs array is required for bulk delete')
    }

    const validRoomIds = roomIds.filter(id => id && id.trim() !== '')
    if (validRoomIds.length === 0) {
      throw new Error('No valid room IDs provided')
    }

    // Transaction mein bulk delete karo
    const result = await prisma.$transaction(async (tx) => {
      // Get interviews to delete
      const interviews = await tx.interview.findMany({
        where: { roomId: { in: validRoomIds } },
        select: { id: true, roomId: true }
      })

      const interviewIds = interviews.map(i => i.id)

      // Delete all events first
      const deletedEvents = await tx.detectionEvent.deleteMany({
        where: { interviewId: { in: interviewIds } }
      })

      // Delete interviews
      const deletedInterviews = await tx.interview.deleteMany({
        where: { roomId: { in: validRoomIds } }
      })

      return {
        deletedInterviews: deletedInterviews.count,
        deletedEvents: deletedEvents.count,
        processedRoomIds: interviews.map(i => i.roomId)
      }
    })

    console.log('✅ Bulk delete completed:', result)

    return {
      success: true,
      ...result,
      message: `Successfully deleted ${result.deletedInterviews} interviews and ${result.deletedEvents} events`
    }

  } catch (error) {
    console.error('❌ Bulk delete error:', error)
    return {
      success: false,
      error: 'Failed to bulk delete interviews',
      details: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/* ----------------------------
  10. ANALYTICS - Dashboard statistics ke liye
----------------------------- */
export async function getInterviewAnalytics() {
  try {
    console.log('📊 Generating interview analytics...')

    // Parallel queries for better performance
    const [
      totalInterviews,
      activeInterviews,
      completedInterviews,
      avgIntegrityScore,
      totalEvents,
      recentInterviews
    ] = await Promise.all([
      prisma.interview.count(),
      prisma.interview.count({ where: { status: 'active' } }),
      prisma.interview.count({ where: { status: 'completed' } }),
      prisma.interview.aggregate({
        where: { status: 'completed' },
        _avg: { integrityScore: true }
      }),
      prisma.detectionEvent.count(),
      prisma.interview.findMany({
        take: 5,
        orderBy: { startTime: 'desc' },
        select: {
          roomId: true,
          candidateName: true,
          startTime: true,
          integrityScore: true,
          status: true
        }
      })
    ])

    // Event type breakdown
    const eventBreakdown = await prisma.detectionEvent.groupBy({
      by: ['type'],
      _count: { type: true },
      orderBy: { _count: { type: 'desc' } }
    })

    // Score distribution
    const scoreDistribution = await prisma.interview.groupBy({
      by: ['integrityScore'],
      where: { 
        status: 'completed',
        integrityScore: { not: undefined }
      },
      _count: { integrityScore: true }
    })

    const analytics = {
      overview: {
        totalInterviews,
        activeInterviews,
        completedInterviews,
        cancelledInterviews: totalInterviews - activeInterviews - completedInterviews,
        avgIntegrityScore: Math.round((avgIntegrityScore._avg.integrityScore || 0) * 100) / 100,
        totalEvents
      },
      eventBreakdown: eventBreakdown.map(item => ({
        type: item.type.replace(/_/g, ' '),
        count: item._count.type
      })),
      scoreDistribution: {
        excellent: scoreDistribution.filter(s => s.integrityScore >= 90).reduce((acc, curr) => acc + curr._count.integrityScore, 0),
        good: scoreDistribution.filter(s => s.integrityScore >= 75 && s.integrityScore < 90).reduce((acc, curr) => acc + curr._count.integrityScore, 0),
        average: scoreDistribution.filter(s => s.integrityScore >= 60 && s.integrityScore < 75).reduce((acc, curr) => acc + curr._count.integrityScore, 0),
        poor: scoreDistribution.filter(s => s.integrityScore < 60).reduce((acc, curr) => acc + curr._count.integrityScore, 0)
      },
      recentInterviews
    }

    console.log('✅ Analytics generated successfully')
    return { success: true, data: analytics }

  } catch (error) {
    console.error('❌ Analytics error:', error)
    return {
      success: false,
      error: 'Failed to generate analytics',
      details: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/* ----------------------------
  11. SEARCH AND FILTER - Advanced queries ke liye
----------------------------- */
export async function searchInterviews(params: {
  query?: string;
  status?: 'active' | 'completed' | 'cancelled';
  scoreRange?: { min: number; max: number };
  dateRange?: { start: Date; end: Date };
  limit?: number;
  offset?: number;
}) {
  try {
    console.log('🔍 Searching interviews with params:', params)

    const {
      query = '',
      status,
      scoreRange,
      dateRange,
      limit = 50,
      offset = 0
    } = params

    // Build where clause dynamically
    const whereClause: any = {}

    // Text search in candidate name or room ID
    if (query && query.trim() !== '') {
      whereClause.OR = [
        { candidateName: { contains: query.trim(), mode: 'insensitive' } },
        { roomId: { contains: query.trim(), mode: 'insensitive' } }
      ]
    }

    // Status filter
    if (status) {
      whereClause.status = status
    }

    // Score range filter
    if (scoreRange) {
      whereClause.integrityScore = {
        gte: scoreRange.min,
        lte: scoreRange.max
      }
    }

    // Date range filter
    if (dateRange) {
      whereClause.startTime = {
        gte: dateRange.start,
        lte: dateRange.end
      }
    }

    // Execute search with count
    const [interviews, total] = await Promise.all([
      prisma.interview.findMany({
        where: whereClause,
        orderBy: { startTime: 'desc' },
        take: limit,
        skip: offset,
        include: {
          _count: {
            select: { events: true }
          }
        }
      }),
      prisma.interview.count({ where: whereClause })
    ])

    console.log(`✅ Found ${interviews.length} interviews out of ${total} total`)

    return {
      success: true,
      data: {
        interviews,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + interviews.length < total
        }
      }
    }

  } catch (error) {
    console.error('❌ Search error:', error)
    return {
      success: false,
      error: 'Failed to search interviews',
      details: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}