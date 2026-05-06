"use client";

import { useEffect, useRef, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { MushafItem, QuranPageResponse, ResearchAgentAyah } from "@q-basair/shared";

import { LogoutButton } from "@/features/auth/logout-button";
import { ReaderPane } from "@/features/workspace/components/reader-pane";
import { ResearchPane } from "@/features/workspace/components/research-pane";
import { API_BASE_URL } from "@/lib/config";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

export function ResearchPageShell() {
  const [mushafs, setMushafs] = useState<MushafItem[]>([]);
  const [selectedMushaf, setSelectedMushaf] = useState(1);
  const [loadingMushafs, setLoadingMushafs] = useState(true);
  const [readerData, setReaderData] = useState<QuranPageResponse | null>(null);
  const [readerPageDraft, setReaderPageDraft] = useState("");
  const [selectedAyahId, setSelectedAyahId] = useState<number | null>(null);
  const [selectedHighlights, setSelectedHighlights] = useState<number[]>([]);
  const [isLoadingReader, setIsLoadingReader] = useState(false);
  const readerBodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const storedMushaf = Number(window.localStorage.getItem("selectedMushaf") || "1");
    if (Number.isFinite(storedMushaf) && storedMushaf > 0) {
      setSelectedMushaf(storedMushaf);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMushafs() {
      try {
        const items = await api.getMushafs();
        if (cancelled) {
          return;
        }
        setMushafs(items);
        setSelectedMushaf((current) => (items.some((item) => item.id === current) ? current : items[0]?.id ?? 1));
      } finally {
        if (!cancelled) {
          setLoadingMushafs(false);
        }
      }
    }

    void loadMushafs();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("selectedMushaf", String(selectedMushaf));
  }, [selectedMushaf]);

  useEffect(() => {
    setReaderPageDraft(readerData?.page ? String(readerData.page) : "");
  }, [readerData?.page]);

  async function selectAyah(verse: ResearchAgentAyah) {
    setSelectedAyahId(verse.ayah_id);
    setSelectedHighlights(Array.isArray(verse.highlights) ? verse.highlights : []);
    setIsLoadingReader(true);
    try {
      const pageData = await api.getQuranPageForAyah(verse.mushaf_id || selectedMushaf, verse.ayah_id);
      if (!pageData.found) {
        throw new Error("تعذّر تحميل صفحة المصحف.");
      }
      setReaderData(pageData);
    } finally {
      setIsLoadingReader(false);
    }
  }

  async function loadReaderPage(page: number) {
    if (!selectedAyahId) {
      return;
    }
    setIsLoadingReader(true);
    try {
      const pageData = await api.getQuranPage(selectedMushaf, page, selectedAyahId);
      if (!pageData.found) {
        throw new Error("تعذّر تحميل صفحة المصحف.");
      }
      setReaderData(pageData);
    } finally {
      setIsLoadingReader(false);
    }
  }

  const hasReaderData = Boolean(readerData);

  return (
    <div className="research-page-shell">
      <div className="research-page-topbar">
        <a className="research-page-back" href="/">
          العودة إلى البحث
        </a>
        <div className="research-page-copy">
          <h1>الباحث الذكي</h1>
          <p>مساحة مخصّصة لطرح الأسئلة الحرة وربط الإجابات بآيات القرآن.</p>
        </div>
        <LogoutButton />
      </div>

      <div className={`research-page-grid${hasReaderData ? " has-reader" : ""}`}>
        <ResearchPane
          fullPage
          selectedMushaf={selectedMushaf}
          mushafs={mushafs}
          loadingMushafs={loadingMushafs}
          onMushafChange={setSelectedMushaf}
          onSelectAyah={(ayah) => selectAyah(ayah)}
        />

        {hasReaderData ? (
          <ReaderPane
            readerData={readerData}
            isLoadingReader={isLoadingReader}
            readerBodyRef={readerBodyRef}
            readerPageDraft={readerPageDraft}
            selectedHighlights={selectedHighlights}
            onPageDraftChange={setReaderPageDraft}
            onPageSubmit={loadReaderPage}
          />
        ) : null}
      </div>
    </div>
  );
}
