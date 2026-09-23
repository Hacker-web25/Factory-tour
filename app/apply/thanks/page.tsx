"use client";

import { CheckCircle2 } from "lucide-react";

export default function ApplyThanks() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 md:px-8 py-4 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1468d8] to-[#0b3d91] grid place-items-center text-white text-[13px] font-bold tracking-tighter">
            VPV
          </div>
          <div className="text-[13px] font-semibold text-slate-800">
            Qualification Form
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 md:px-8 py-24 md:py-32">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 grid place-items-center shadow-[0_15px_40px_-10px_rgba(16,185,129,0.5)] mb-6">
            <CheckCircle2 size={28} className="text-white" />
          </div>
          <h1 className="text-[32px] md:text-[40px] font-semibold tracking-tight leading-tight mb-3">
            Thank you.
          </h1>
          <p className="text-[15px] text-slate-600 leading-relaxed mb-10 max-w-lg mx-auto">
            Your application has been received. The VPV team reviews every
            submission personally — you&apos;ll hear from us within{" "}
            <span className="text-slate-900 font-semibold">
              24 business hours
            </span>{" "}
            with a tailored assessment of your Trust Deficit and the exact
            steps to bridge it.
          </p>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8 text-left shadow-sm">
            <div className="text-[11px] font-semibold tracking-widest uppercase text-[#1468d8] mb-3">
              What happens next
            </div>
            <ol className="space-y-4 text-[14px] text-slate-700">
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-[#1468d8]/10 text-[#1468d8] grid place-items-center text-[12px] font-bold shrink-0">
                  1
                </span>
                <span>
                  We study your answers against 100+ export-house benchmarks
                  and build a private diagnostic report for your business.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-[#1468d8]/10 text-[#1468d8] grid place-items-center text-[12px] font-bold shrink-0">
                  2
                </span>
                <span>
                  A short call to walk you through the report and answer any
                  questions. No sales pressure — this call is worth taking
                  either way.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-[#1468d8]/10 text-[#1468d8] grid place-items-center text-[12px] font-bold shrink-0">
                  3
                </span>
                <span>
                  If VPV is a fit, we walk your team through onboarding. If
                  not, you keep the report.
                </span>
              </li>
            </ol>
          </div>

          <div className="mt-10">
            <a
              href="https://myvpv.com"
              className="text-[13px] text-slate-500 hover:text-slate-800"
            >
              ← Back to myvpv.com
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
