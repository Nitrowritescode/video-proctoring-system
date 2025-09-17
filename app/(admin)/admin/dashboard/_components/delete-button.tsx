"use client"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu"
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from "@/components/ui/alert-dialog"
import { deleteInterview } from "@/lib/actions/interview-actions"
import { Trash2 } from "lucide-react"

export function DeleteInterviewButton({ roomId, candidateName }: { roomId: string, candidateName: string }) {
    const handleDelete = async () => {
        try {
            const result = await deleteInterview(roomId)
            if (result.success) {
                window.location.reload() // Simple refresh - can be improved with state management
            } else {
                alert('Failed to delete interview')
            }
        } catch (error) {
            alert('Error deleting interview')
        }
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Trash2 className="mr-2 sozew" />
                    Delete
                </DropdownMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete Interview</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to delete the interview for <strong>{candidateName}</strong>?
                        This action cannot be undone and will permanently remove all associated data.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}