import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/client'
import Header from '../components/Header'
import LoadingSpinner from '../components/LoadingSpinner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function RegistrationSuccess() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const [workshops, setWorkshops] = useState([])
    const [totalCredits, setTotalCredits] = useState(0)
    const [isLoading, setIsLoading] = useState(true)
    const [showDownloadMenu, setShowDownloadMenu] = useState(false)

    useEffect(() => {
        loadMyWorkshops()
    }, [])

    const loadMyWorkshops = async () => {
        try {
            const response = await api.getMyWorkshops()
            setWorkshops(response.workshops || response.courses || [])
            setTotalCredits(response.totalCredits || 0)
        } catch (err) {
            console.error('Failed to load workshops:', err)
        } finally {
            setIsLoading(false)
        }
    }

    const handleBackToKRS = () => {
        navigate('/workshop-selection')
    }

    const formatScheduleText = (schedule) => {
        if (!schedule) return '-'
        return schedule.split(', ').map(s => {
            const parts = s.match(/^(\S+)\s+(.+)$/)
            if (!parts) return s
            return `${parts[1]} ${parts[2]}`
        }).join(', ')
    }

    const handleDownloadPDF = () => {
        const doc = new jsPDF()
        const pageW = doc.internal.pageSize.getWidth()

        // Primary blue: #0066B3 = rgb(0, 102, 179)
        // Light blue: #E8F1FA = rgb(232, 241, 250)
        // Background: #F0F6FC = rgb(240, 246, 252)
        // Border: #C5D8ED = rgb(197, 216, 237)
        // Text muted: #4A6E8F = rgb(74, 110, 143)

        // Header banner — primary blue
        doc.setFillColor(0, 102, 179)
        doc.rect(0, 0, pageW, 40, 'F')
        // White accent stripe
        doc.setFillColor(255, 255, 255)
        doc.rect(0, 40, pageW, 1.5, 'F')

        // Title on banner
        doc.setFontSize(20)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(255, 255, 255)
        doc.text('UKSW WORKSHOP REGISTRATION', pageW / 2, 18, { align: 'center' })
        doc.setFontSize(11)
        doc.setTextColor(197, 216, 237)
        doc.text('Workshop Registration Summary — 2024 Series', pageW / 2, 28, { align: 'center' })

        // Student info card — light blue background
        doc.setTextColor(0, 0, 0)
        doc.setFillColor(240, 246, 252)
        doc.setDrawColor(197, 216, 237)
        doc.setLineWidth(0.3)
        doc.roundedRect(14, 48, pageW - 28, 28, 3, 3, 'FD')
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(74, 110, 143)
        doc.text('Student Name:', 20, 57)
        doc.text('NIM:', 20, 64)
        doc.text('Total Credits:', pageW / 2 + 10, 57)
        doc.text('Generated:', pageW / 2 + 10, 64)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(0, 30, 60)
        doc.text(user?.name || '-', 55, 57)
        doc.text(user?.nim || '-', 35, 64)
        doc.text(`${totalCredits} Credits`, pageW / 2 + 42, 57)
        doc.text(new Date().toLocaleString('id-ID'), pageW / 2 + 42, 64)

        // Table data
        const tableData = workshops.map((ws, i) => [
            i + 1,
            ws.workshopCode || ws.code,
            ws.workshopName || ws.name,
            `${ws.credits} Credits`,
            formatScheduleText(ws.schedule),
            ws.mentor || '-'
        ])

        // Generate table — blue header
        autoTable(doc, {
            startY: 82,
            head: [['No', 'Code', 'Workshop Name', 'Credits', 'Schedule', 'Mentor']],
            body: tableData,
            theme: 'striped',
            styles: { fontSize: 9, cellPadding: 4, textColor: [0, 30, 60] },
            headStyles: {
                fillColor: [0, 102, 179],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                halign: 'center',
                fontSize: 9,
            },
            alternateRowStyles: { fillColor: [240, 246, 252] },
            columnStyles: {
                0: { halign: 'center', cellWidth: 12 },
                1: { cellWidth: 22 },
                3: { halign: 'center', cellWidth: 22 },
            },
            margin: { left: 14, right: 14 },
        })

        // Credit summary box — primary blue fill
        const finalY = doc.lastAutoTable.finalY + 8
        doc.setFillColor(0, 102, 179)
        doc.roundedRect(pageW - 80, finalY, 66, 14, 2, 2, 'F')
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(255, 255, 255)
        doc.text(`Total: ${totalCredits} Credits`, pageW - 47, finalY + 9, { align: 'center' })

        // Footer
        doc.setTextColor(74, 110, 143)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.text('This document is automatically generated by UKSW Workshop Platform.', 14, finalY + 24)
        doc.text('\u00A9 2024 Universitas Kristen Satya Wacana', 14, finalY + 30)

        // Page border — primary blue
        doc.setDrawColor(0, 102, 179)
        doc.setLineWidth(0.5)
        doc.rect(5, 5, pageW - 10, doc.internal.pageSize.getHeight() - 10)

        doc.save(`Workshop_Registration_${user?.nim || 'student'}_${new Date().toISOString().split('T')[0]}.pdf`)
        setShowDownloadMenu(false)
    }

    const handleDownloadCSV = () => {
        const bom = '\uFEFF'
        const divider = ',,,,,'

        let csv = bom
        csv += 'WORKSHOP REGISTRATION SUMMARY\n'
        csv += `"Series:","Workshop Series 2024",,,,\n`
        csv += `"Student:","${user?.name || '-'}",,,,\n`
        csv += `"NIM:","${user?.nim || '-'}",,,,\n`
        csv += `"Total Credits:","${totalCredits} Credits",,,,\n`
        csv += `"Generated:","${new Date().toLocaleString('id-ID')}",,,,\n`
        csv += divider + '\n'

        csv += 'No,Code,Workshop Name,Credits,Schedule,Mentor\n'

        workshops.forEach((ws, i) => {
            csv += [
                i + 1,
                ws.workshopCode || ws.code,
                `"${(ws.workshopName || ws.name).replace(/"/g, '""')}"`,
                ws.credits,
                `"${formatScheduleText(ws.schedule)}"`,
                `"${(ws.mentor || '-').replace(/"/g, '""')}"`
            ].join(',') + '\n'
        })

        csv += divider + '\n'
        csv += `,,,'Total Credits:',${totalCredits},\n`

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `Workshop_Registration_${user?.nim || 'student'}_${new Date().toISOString().split('T')[0]}.csv`
        link.click()
        URL.revokeObjectURL(link.href)
        setShowDownloadMenu(false)
    }

    if (isLoading) {
        return (
            <div className="bg-background-dark min-h-screen flex items-center justify-center">
                <LoadingSpinner size="lg" text="Loading registration data..." />
            </div>
        )
    }

    return (
        <div className="bg-background-dark min-h-screen flex flex-col text-gray-800">
            <Header title="UKSW Workshop Platform" />

            <main className="flex-1 p-6 lg:p-10">
                <div className="max-w-4xl mx-auto flex flex-col gap-8 animate-in">
                    {/* Success Header */}
                    <div className="text-center space-y-4">
                        <div className="inline-flex items-center justify-center size-20 rounded-full bg-green-500/20 border border-green-500/30 mb-4">
                            <span className="material-symbols-outlined text-green-400 text-4xl">check_circle</span>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-gray-800">
                            Registration Complete!
                        </h1>
                        <p className="text-text-muted text-lg max-w-md mx-auto">
                            Your workshop registration for 2024/2025 has been successfully submitted.
                        </p>
                    </div>

                    {/* Student Info Card */}
                    <div className="bg-surface-dark rounded-xl border border-border-dark p-6">
                        <div className="flex flex-wrap items-center gap-6">
                            <div className="size-16 rounded-full bg-primary/20 flex items-center justify-center text-primary text-2xl font-bold">
                                {user?.name?.charAt(0) || 'S'}
                            </div>
                            <div className="flex-1">
                                <h2 className="text-xl font-bold text-gray-800">{user?.name || 'Student'}</h2>
                                <p className="text-text-muted">NIM: {user?.nim || '-'}</p>
                            </div>
                            <div className="w-full sm:w-auto flex items-center gap-4 border-t sm:border-t-0 border-border-dark pt-4 sm:pt-0 mt-2 sm:mt-0">
                                <div className="text-left sm:text-right flex-1 sm:flex-initial">
                                    <p className="text-xs text-text-muted uppercase tracking-wider">Total Credits</p>
                                    <p className="text-2xl font-bold text-primary">{totalCredits} Credits</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Enrolled Workshops Table */}
                    <div className="bg-surface-dark rounded-xl border border-border-dark overflow-hidden">
                        <div className="px-6 py-4 border-b border-border-dark">
                            <h3 className="text-lg font-bold text-gray-800">Enrolled Workshops</h3>
                        </div>

                        <div className="w-full overflow-x-auto">
                            <table className="w-full min-w-[800px]">
                                <thead className="bg-background-dark/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">No</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Code</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Workshop Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Credits</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Schedule</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Mentor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-dark">
                                    {workshops.map((ws, index) => (
                                        <tr key={ws.id} className="hover:bg-primary/5 transition-colors">
                                            <td className="px-6 py-4 text-sm text-gray-800">{index + 1}</td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-1 bg-primary/20 text-primary text-xs font-bold rounded">
                                                    {ws.workshopCode || ws.code}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm font-medium text-gray-800">{ws.workshopName || ws.name}</td>
                                            <td className="px-6 py-4 text-sm text-text-muted">{ws.credits} Credits</td>
                                            <td className="px-6 py-4 text-sm text-text-muted">
                                                {ws.schedule ? (
                                                    <div className="flex flex-col gap-1.5">
                                                        {ws.schedule.split(', ').map((sched, i) => {
                                                            const match = sched.match(/^(\S+)\s+(.+)$/)
                                                            if (!match) return <span key={i}>{sched}</span>

                                                            const [, day, time] = match
                                                            return (
                                                                <div key={i} className="flex items-center gap-2 whitespace-nowrap">
                                                                    <span className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-primary' : 'bg-primary/30'}`}></span>
                                                                    <span className="font-medium text-gray-800">{day}</span>
                                                                    <span className="text-xs text-text-muted bg-white/5 px-2 py-0.5 rounded border border-white/10">{time}</span>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                ) : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-text-muted">{ws.mentor || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {workshops.length === 0 && (
                            <div className="px-6 py-12 text-center text-text-muted">
                                <span className="material-symbols-outlined text-4xl mb-2">inbox</span>
                                <p>No workshops enrolled yet.</p>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap justify-center gap-4">
                        <button
                            onClick={handleBackToKRS}
                            className="flex items-center gap-2 px-6 py-3 rounded-lg border border-border-dark text-gray-800 hover:border-primary hover:text-primary transition-colors"
                        >
                            <span className="material-symbols-outlined">arrow_back</span>
                            Edit Workshops
                        </button>

                        {/* Download Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                                className="flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-background-dark font-bold hover:bg-primary-hover transition-colors"
                            >
                                <span className="material-symbols-outlined">download</span>
                                Download Summary
                                <span className="material-symbols-outlined text-[18px]">
                                    {showDownloadMenu ? 'expand_less' : 'expand_more'}
                                </span>
                            </button>

                            {showDownloadMenu && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowDownloadMenu(false)} />
                                    <div className="absolute right-0 mt-2 w-56 bg-surface-dark border border-border-dark rounded-xl shadow-2xl z-50 overflow-hidden animate-in zoom-in-95">
                                        <div className="p-1.5">
                                            <button
                                                onClick={handleDownloadPDF}
                                                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-primary/10 transition-colors group"
                                            >
                                                <div className="p-2 bg-red-500/20 rounded-lg group-hover:bg-red-500/30 transition-colors">
                                                    <span className="material-symbols-outlined text-red-400 text-[20px]">picture_as_pdf</span>
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-gray-800 text-sm font-bold">PDF Document</p>
                                                    <p className="text-text-muted text-xs">Formatted for printing</p>
                                                </div>
                                            </button>
                                            <button
                                                onClick={handleDownloadCSV}
                                                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-primary/10 transition-colors group"
                                            >
                                                <div className="p-2 bg-green-500/20 rounded-lg group-hover:bg-green-500/30 transition-colors">
                                                    <span className="material-symbols-outlined text-green-400 text-[20px]">table_chart</span>
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-gray-800 text-sm font-bold">CSV Spreadsheet</p>
                                                    <p className="text-text-muted text-xs">Open in Excel / Sheets</p>
                                                </div>
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Important Notes */}
                    <div className="bg-blue-900/10 border border-blue-500/20 rounded-xl p-6">
                        <div className="flex gap-4">
                            <span className="material-symbols-outlined text-blue-400 text-xl">info</span>
                            <div>
                                <h4 className="font-bold text-blue-200 mb-2">Important Information</h4>
                                <ul className="text-sm text-blue-300/80 space-y-1 list-disc list-inside">
                                    <li>Your mentor will review your workshop selection within 2-3 business days</li>
                                    <li>You may modify your workshops until the registration deadline</li>
                                    <li>Check your email for confirmation and any required actions</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-border-dark py-6 px-6 lg:px-12 mt-auto bg-background-dark/50">
                <div className="max-w-7xl mx-auto text-center text-sm text-text-muted">
                    <p>&copy; 2024 UKSW Workshop Platform. All rights reserved.</p>
                </div>
            </footer>
        </div>
    )
}
