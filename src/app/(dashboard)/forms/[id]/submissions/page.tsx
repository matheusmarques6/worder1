'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Loader2, Users, Mail, Phone, Calendar,
  ChevronLeft, ChevronRight, Eye, Zap, Clock,
  CheckCircle, AlertCircle, XCircle,
} from 'lucide-react'

interface Submission {
  id: string
  answers: Record<string, any>
  status: string
  referrer: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  events_fired: any[]
  created_at: string
  contact: { id: string; name: string; email: string; phone: string } | null
  deal: { id: string; title: string; stage_id: string; value: number } | null
}

const statusLabels: Record<string, { label: string; color: string }> = {
  new: { label: 'Novo', color: 'bg-blue-500/10 text-blue-400' },
  contacted: { label: 'Contactado', color: 'bg-yellow-500/10 text-yellow-400' },
  qualified: { label: 'Qualificado', color: 'bg-green-500/10 text-green-400' },
  converted: { label: 'Convertido', color: 'bg-purple-500/10 text-purple-400' },
  lost: { label: 'Perdido', color: 'bg-red-500/10 text-red-400' },
}

export default function FormSubmissionsPage() {
  const params = useParams()
  const router = useRouter()
  const formId = params.id as string

  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)

  const fetchSubmissions = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`/api/forms/${formId}/submissions?page=${page}&limit=20`)
      if (res.ok) {
        const data = await res.json()
        setSubmissions(data.submissions || [])
        setTotalPages(data.totalPages || 1)
        setTotal(data.total || 0)
      }
    } catch (error) {
      console.error('Error fetching submissions:', error)
    } finally {
      setIsLoading(false)
    }
  }, [formId, page])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.push(`/forms/${formId}`)} className="p-2 rounded-lg hover:bg-white text-gray-500 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Submissions</h1>
          <p className="text-gray-500 mt-1">{total} leads captados</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
        </div>
      ) : submissions.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-2xl border border-gray-200/30 border-dashed"
        >
          <Users className="w-12 h-12 text-gray-500 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Nenhum lead ainda</h3>
          <p className="text-gray-500">Quando leads submeterem o formulario, eles aparecrao aqui.</p>
        </motion.div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Submissions List */}
            <div className="lg:col-span-2 space-y-2">
              {submissions.map(sub => (
                <motion.div
                  key={sub.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => setSelectedSubmission(sub)}
                  className={`p-4 bg-white border rounded-xl cursor-pointer transition-all ${
                    selectedSubmission?.id === sub.id
                      ? 'border-brand-400 bg-white'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center">
                        <Users className="w-5 h-5 text-brand-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {sub.contact?.name || 'Lead sem nome'}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          {sub.contact?.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {sub.contact.email}
                            </span>
                          )}
                          {sub.contact?.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {sub.contact.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${statusLabels[sub.status]?.color || 'bg-gray-100 text-gray-500'}`}>
                        {statusLabels[sub.status]?.label || sub.status}
                      </span>
                      {sub.events_fired?.length > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-400">
                          <Zap className="w-3 h-3" />
                          {sub.events_fired.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    <Calendar className="w-3 h-3" />
                    {formatDate(sub.created_at)}
                    {sub.utm_source && <span className="px-1.5 py-0.5 bg-gray-100 rounded">{sub.utm_source}</span>}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Detail Panel */}
            <div className="lg:col-span-1">
              {selectedSubmission ? (
                <div className="sticky top-20 p-5 bg-white border border-gray-200 rounded-xl space-y-4">
                  <h3 className="text-base font-semibold text-gray-900">Detalhes</h3>

                  {/* Contact info */}
                  {selectedSubmission.contact && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 font-medium">Contato</p>
                      <div className="space-y-1">
                        <p className="text-sm text-white">{selectedSubmission.contact.name}</p>
                        {selectedSubmission.contact.email && <p className="text-xs text-gray-600">{selectedSubmission.contact.email}</p>}
                        {selectedSubmission.contact.phone && <p className="text-xs text-gray-600">{selectedSubmission.contact.phone}</p>}
                      </div>
                    </div>
                  )}

                  {/* Answers */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 font-medium">Respostas</p>
                    <div className="space-y-2">
                      {Object.entries(selectedSubmission.answers).map(([fieldId, value]) => (
                        <div key={fieldId} className="p-2 bg-gray-50 rounded-lg">
                          <p className="text-[10px] text-gray-400">{fieldId}</p>
                          <p className="text-xs text-white">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Events */}
                  {selectedSubmission.events_fired?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 font-medium">Eventos Disparados</p>
                      <div className="space-y-1">
                        {selectedSubmission.events_fired.map((ev: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                            {ev.success ? (
                              <CheckCircle className="w-3 h-3 text-green-400" />
                            ) : (
                              <XCircle className="w-3 h-3 text-red-400" />
                            )}
                            <span className="text-xs text-white">{ev.event}</span>
                            <span className="text-[10px] text-gray-400">{ev.platform}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* UTM data */}
                  {(selectedSubmission.utm_source || selectedSubmission.utm_campaign) && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 font-medium">UTM</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedSubmission.utm_source && <span className="px-2 py-0.5 bg-gray-100 rounded text-[10px] text-gray-600">source: {selectedSubmission.utm_source}</span>}
                        {selectedSubmission.utm_medium && <span className="px-2 py-0.5 bg-gray-100 rounded text-[10px] text-gray-600">medium: {selectedSubmission.utm_medium}</span>}
                        {selectedSubmission.utm_campaign && <span className="px-2 py-0.5 bg-gray-100 rounded text-[10px] text-gray-600">campaign: {selectedSubmission.utm_campaign}</span>}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-5 bg-gray-50 rounded-xl border border-gray-200/30 text-center">
                  <Eye className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Selecione uma submission para ver detalhes</p>
                </div>
              )}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-white disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-500">
                Pagina {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-white disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
