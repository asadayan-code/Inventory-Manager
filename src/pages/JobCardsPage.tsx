import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';
import { JobCard, ProductVariant } from '../types';
import { formatPKR, pkrToPaisa, formatDateTime } from '../utils/formatters';
import { PrintModal } from '../components/PrintModal';
import {
  Wrench,
  Search,
  PlusCircle,
  Car,
  Printer,
  CheckCircle2,
  Clock,
  X
} from 'lucide-react';

export const JobCardsPage: React.FC = () => {
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // New Job Card Form
  const [carMake, setCarMake] = useState('Toyota');
  const [carModel, setCarModel] = useState('Corolla GLi');
  const [carYear, setCarYear] = useState('2018');
  const [carReg, setCarReg] = useState('LEA-18-4921');
  const [custName, setCustName] = useState('Usman Rafiq');
  const [custPhone, setCustPhone] = useState('0300-8451122');
  const [techName, setTechName] = useState('Ustad Saleem (Master Electrician)');
  const [workDesc, setWorkDesc] = useState('Install 9-inch Android multimedia tab, reverse camera, and 4-door Pioneer speakers.');
  const [labourPKR, setLabourPKR] = useState('2500');

  const [printDoc, setPrintDoc] = useState<{ isOpen: boolean; data: any }>({
    isOpen: false,
    data: null,
  });

  const loadJobCards = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ job_cards: JobCard[] }>('/job-cards', {
        params: { status: statusFilter || undefined },
      });
      setJobCards(res.job_cards);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobCards();
  }, [statusFilter]);

  const handleCreateJobCard = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/job-cards', {
        method: 'POST',
        body: {
          car_make: carMake.trim(),
          car_model: carModel.trim(),
          car_year: carYear.trim(),
          car_registration: carReg.trim().toUpperCase(),
          customer_name: custName.trim(),
          customer_phone: custPhone.trim(),
          technician_name: techName.trim(),
          work_description: workDesc.trim(),
          labour_charge_paisa: pkrToPaisa(labourPKR),
          parts_used: [],
        },
      });

      setShowAddModal(false);
      loadJobCards();
    } catch (err: any) {
      alert(err.message || 'Failed to create job card.');
    }
  };

  const handleUpdateStatus = async (id: number, newStatus: string) => {
    try {
      await apiRequest(`/job-cards/${id}`, {
        method: 'PUT',
        body: { status: newStatus },
      });
      loadJobCards();
    } catch (err: any) {
      alert(err.message || 'Failed to update status.');
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden bg-slate-100">
      <div className="flex items-center justify-between pb-4 border-b border-slate-300">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Wrench className="w-6 h-6 text-emerald-600" />
            Installation & Workshop Job Cards
          </h2>
          <p className="text-xs text-slate-500">
            Audio installation, wiring labour, vehicle registration details, and technician tracking
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">PENDING</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="BILLED">BILLED</option>
          </select>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create Job Card</span>
          </button>
        </div>
      </div>

      {/* Job Cards Table */}
      <div className="flex-1 overflow-y-auto mt-4 bg-white border border-slate-200 rounded-xl shadow-xs">
        {loading ? (
          <div className="text-center py-12 text-xs text-slate-400">Loading job cards...</div>
        ) : jobCards.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-500">No installation job cards found.</div>
        ) : (
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50 border-b text-[10px] uppercase font-bold text-slate-600 sticky top-0">
              <tr>
                <th className="py-2.5 px-4">Job #</th>
                <th className="py-2.5 px-4">Vehicle Details</th>
                <th className="py-2.5 px-4">Customer</th>
                <th className="py-2.5 px-4">Technician</th>
                <th className="py-2.5 px-4">Scope of Work</th>
                <th className="py-2.5 px-4 text-right">Labour (PKR)</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                <th className="py-2.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobCards.map((jc) => (
                <tr key={jc.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">{jc.job_number}</td>
                  <td className="py-3 px-4">
                    <p className="font-extrabold text-indigo-900 font-mono text-sm">{jc.car_registration}</p>
                    <p className="text-slate-600 text-[11px]">{jc.car_make} {jc.car_model} ({jc.car_year})</p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-slate-900">{jc.customer_name}</p>
                    <p className="text-slate-500 text-[11px]">{jc.customer_phone}</p>
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-800">{jc.technician_name}</td>
                  <td className="py-3 px-4 max-w-xs truncate text-slate-700">{jc.work_description}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                    {formatPKR(jc.labour_charge_paisa, false)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <select
                      value={jc.status}
                      onChange={(e) => handleUpdateStatus(jc.id, e.target.value)}
                      className={`border rounded p-1 text-[11px] font-bold ${
                        jc.status === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-800'
                          : jc.status === 'IN_PROGRESS'
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-slate-50 text-slate-700'
                      }`}
                    >
                      <option value="PENDING">PENDING</option>
                      <option value="IN_PROGRESS">IN_PROGRESS</option>
                      <option value="COMPLETED">COMPLETED</option>
                      <option value="BILLED">BILLED</option>
                    </select>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => setPrintDoc({ isOpen: true, data: jc })}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-semibold text-[11px] transition cursor-pointer"
                      title="Print A4 Installation Job Card"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ---------------- NEW JOB CARD MODAL ---------------- */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between pb-3 mb-4 border-b">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Car className="w-5 h-5 text-emerald-600" />
                New Vehicle Installation Job Card
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateJobCard} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Car Registration Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. LEA-18-4921"
                    value={carReg}
                    onChange={(e) => setCarReg(e.target.value)}
                    className="w-full border rounded-lg p-2 font-mono uppercase font-bold focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Make & Model *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Toyota Corolla GLi"
                    value={carModel}
                    onChange={(e) => setCarModel(e.target.value)}
                    className="w-full border rounded-lg p-2 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    className="w-full border rounded-lg p-2 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Customer Phone</label>
                  <input
                    type="text"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    className="w-full border rounded-lg p-2 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Assigned Technician *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ustad Saleem / Imran"
                    value={techName}
                    onChange={(e) => setTechName(e.target.value)}
                    className="w-full border rounded-lg p-2 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Labour Charge (PKR)</label>
                  <input
                    type="text"
                    value={labourPKR}
                    onChange={(e) => setLabourPKR(e.target.value)}
                    className="w-full border rounded-lg p-2 font-mono font-bold focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Work Description & Scope *</label>
                <textarea
                  required
                  rows={3}
                  value={workDesc}
                  onChange={(e) => setWorkDesc(e.target.value)}
                  placeholder="Details of car audio installation, wiring routing, camera fitment..."
                  className="w-full border rounded-lg p-2 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border rounded-lg font-semibold text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer"
                >
                  Save & Print Job Card
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Modal */}
      <PrintModal
        isOpen={printDoc.isOpen}
        onClose={() => setPrintDoc({ ...printDoc, isOpen: false })}
        docType="JOB_CARD"
        data={printDoc.data}
      />
    </div>
  );
};
