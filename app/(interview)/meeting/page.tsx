'use client'

import { createInterviewAction } from "@/lib/actions/interview-actions"


export default function MeetingPage() {
  return (
    <div className="max-w-md mx-auto mt-20 p-6 bg-white shadow rounded min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Start Interview</h1>
      
      <form action={createInterviewAction} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Candidate Name</label>
          <input
            type="text"
            name="candidateName"
            required
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
        >
          Start Meeting
        </button>
      </form>
    </div>
  )
}
