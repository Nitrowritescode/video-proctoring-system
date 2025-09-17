import { getAllInterviews } from "@/lib/actions/interview-actions";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";

export default async function DashboardPage() {
  const interviews = await getAllInterviews();

  // Helper function for status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'completed': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  // Helper function for integrity score color
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 font-bold';
    if (score >= 60) return 'text-yellow-600 font-bold';
    return 'text-red-600 font-bold';
  };

  return (
    <div className="container mx-auto p-6 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-slate-800 mb-2">
            Interview Dashboard
          </h1>
          <p className="text-slate-600">
            Monitor and manage all interview sessions
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/">
            <Button variant="outline" className="flex items-center gap-2">
              🏠 Home
            </Button>
          </Link>
          <Link href="/meeting">
            <Button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700">
              ➕ New Interview
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-4 bg-white shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-800">{interviews.length}</div>
            <div className="text-sm text-slate-600">Total Interviews</div>
          </div>
        </Card>
        <Card className="p-4 bg-white shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {interviews.filter(i => i.status === 'active').length}
            </div>
            <div className="text-sm text-slate-600">Active Now</div>
          </div>
        </Card>
        <Card className="p-4 bg-white shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {interviews.filter(i => i.status === 'completed').length}
            </div>
            <div className="text-sm text-slate-600">Completed</div>
          </div>
        </Card>
        <Card className="p-4 bg-white shadow-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {interviews.filter(i => i.integrityScore < 70).length}
            </div>
            <div className="text-sm text-slate-600">Low Integrity</div>
          </div>
        </Card>
      </div>

      {/* Main Content */}
      {interviews.length === 0 ? (
        <Card className="p-12 text-center bg-white shadow-md">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-2xl font-bold text-slate-700 mb-2">
              No Interviews Yet
            </h2>
            <p className="text-slate-500 mb-6">
              Start your first interview to see the dashboard in action
            </p>
            <Link href="/meeting">
              <Button className="bg-blue-600 hover:bg-blue-700">
                Start First Interview
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="bg-white shadow-md">
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold text-slate-800">
              All Interviews ({interviews.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-bold">Candidate</TableHead>
                  <TableHead className="font-bold">Room ID</TableHead>
                  <TableHead className="font-bold">Status</TableHead>
                  <TableHead className="font-bold">Duration</TableHead>
                  <TableHead className="font-bold">Integrity Score</TableHead>
                  <TableHead className="font-bold">Events</TableHead>
                  <TableHead className="font-bold">Started</TableHead>
                  <TableHead className="font-bold text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interviews.map((interview: any) => (
                  <TableRow key={interview.id} className="hover:bg-slate-50">
                    
                    {/* Candidate Name */}
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600">
                          {(interview.candidateName || 'U')[0].toUpperCase()}
                        </div>
                        {interview.candidateName || 'Unnamed Candidate'}
                      </div>
                    </TableCell>

                    {/* Room ID */}
                    <TableCell>
                      <code className="bg-slate-100 px-2 py-1 rounded text-sm">
                        {interview.roomId.slice(-8)}
                      </code>
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <Badge 
                        className={`${getStatusColor(interview.status)} text-white capitalize`}
                      >
                        {interview.status}
                      </Badge>
                    </TableCell>

                    {/* Duration */}
                    <TableCell>
                      {interview.duration ? `${interview.duration} mins` : 'Ongoing'}
                    </TableCell>

                    {/* Integrity Score */}
                    <TableCell>
                      <span className={getScoreColor(interview.integrityScore)}>
                        {interview.integrityScore}/100
                      </span>
                    </TableCell>

                    {/* Total Events */}
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="text-xs w-fit">
                          Total: {interview.totalEvents}
                        </Badge>
                        {interview.totalEvents > 0 && (
                          <div className="text-xs text-slate-500">
                            Focus: {interview.focusLostCount} | Phone: {interview.phoneDetectedCount}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Started Time */}
                    <TableCell>
                      <div className="text-sm">
                        <div>{new Date(interview.startTime).toLocaleDateString()}</div>
                        <div className="text-slate-500">
                          {new Date(interview.startTime).toLocaleTimeString()}
                        </div>
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      <div className="flex gap-2 justify-center">
                        
                        {/* View Interview */}
                        <Link href={`/room/${interview.roomId}`}>
                          <Button variant="outline" size="sm" className="text-xs">
                            👁️ View
                          </Button>
                        </Link>

                        {/* Download PDF */}
                        {interview.pdfUrl && (
                          <a 
                            href={interview.pdfUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            <Button variant="outline" size="sm" className="text-xs">
                              📄 PDF
                            </Button>
                          </a>
                        )}

                        {/* Download Video */}
                        {interview.videoUrl && (
                          <a 
                            href={interview.videoUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            <Button variant="outline" size="sm" className="text-xs">
                              🎥 Video
                            </Button>
                          </a>
                        )}
                      </div>
                    </TableCell>

                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Footer Info */}
      <div className="mt-8 text-center text-slate-500 text-sm">
        <p>Last updated: {new Date().toLocaleString()}</p>
      </div>
    </div>
  );
}