import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

type Section = {
    heading: string;
    content: string;
};

type AboutData = {
    title: string;
    sections: Section[];
};

export default function AboutEditor() {
    const [about, setAbout] = useState<AboutData>({ title: '', sections: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sha, setSha] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const resp = await axios.get('/api/about');
                if (cancelled) return;
                setAbout(resp.data.content);
                setSha(resp.data.sha);
                setError(null);
            } catch (e: any) {
                setError(e?.response?.data?.error || e?.message || 'Failed to load about.json');
            } finally {
                setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        }
    }, []);

    const addSection = () => {
        setAbout(prev => ({
            ...prev,
            sections: [...prev.sections, { heading: '', content: '' }]
        }));
    };

    const removeSection = (index: number) => {
        setAbout(prev => ({
            ...prev,
            sections: prev.sections.filter((_, i) => i !== index)
        }));
    };

    const updateSection = (index: number, key: keyof Section, value: string) => {
        setAbout(prev => ({
            ...prev,
            sections: prev.sections.map((s, i) => i === index ? { ...s, [key]: value } : s)
        }));
    };

    const isValid = useMemo(() => {
        if (!about.title?.trim()) return false;
        return about.sections.every(s => s.heading?.trim() && s.content?.trim());
    }, [about]);

    const pushChanges = async () => {
        try {
            setSaving(true);
            setError(null);
            const resp = await axios.post('/api/about', {
                content: about,
                commitMessage: 'Update about.json via dashboard',
                baseSha: sha || undefined,
            });
            // Update local sha after commit to avoid conflicts on subsequent saves
            if (resp.data?.commit?.sha) {
                setSha(resp.data.commit.sha);
            }
            alert('Changes pushed successfully.');
        } catch (e: any) {
            const details = e?.response?.data?.details;
            const message = typeof details === 'string' ? details : (details?.message || e.message);
            setError(message || 'Failed to push changes');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div style={{ padding: 24 }}>Loading…</div>;
    }

    return (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <h1>About.json Editor</h1>
            {error && (
                <div style={{ color: 'white', background: '#b00020', padding: '8px 12px', borderRadius: 6 }}>
                    {String(error)}
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontWeight: 600 }}>Title</label>
                <input
                    value={about.title}
                    onChange={e => setAbout({ ...about, title: e.target.value })}
                    placeholder="ABOUT"
                    style={{ padding: 10, fontSize: 16, borderRadius: 6, border: '1px solid #ccc' }}
                />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0 }}>Sections</h2>
                <button onClick={addSection} style={{ padding: '8px 12px', borderRadius: 6, background: '#2563eb', color: 'white', border: 0, cursor: 'pointer' }}>+ Add section</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {about.sections.map((section, idx) => (
                    <div key={idx} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <strong>Section {idx + 1}</strong>
                            <button onClick={() => removeSection(idx)} style={{ padding: '6px 10px', borderRadius: 6, background: '#ef4444', color: 'white', border: 0, cursor: 'pointer' }}>Remove</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <label style={{ fontWeight: 600 }}>Heading</label>
                            <input
                                value={section.heading}
                                onChange={e => updateSection(idx, 'heading', e.target.value)}
                                placeholder="GRASSROOTS"
                                style={{ padding: 10, fontSize: 16, borderRadius: 6, border: '1px solid #ccc' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <label style={{ fontWeight: 600 }}>Content</label>
                            <textarea
                                value={section.content}
                                onChange={e => updateSection(idx, 'content', e.target.value)}
                                placeholder="Content..."
                                rows={4}
                                style={{ padding: 10, fontSize: 16, borderRadius: 6, border: '1px solid #ccc', resize: 'vertical' }}
                            />
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
                <button
                    onClick={pushChanges}
                    disabled={!isValid || saving}
                    style={{ padding: '10px 14px', borderRadius: 8, background: !isValid || saving ? '#9ca3af' : '#10b981', color: 'white', border: 0, cursor: !isValid || saving ? 'not-allowed' : 'pointer' }}
                >
                    {saving ? 'Pushing…' : 'Push changes'}
                </button>
                <button
                    onClick={() => window.location.reload()}
                    disabled={saving}
                    style={{ padding: '10px 14px', borderRadius: 8, background: '#6b7280', color: 'white', border: 0, cursor: saving ? 'not-allowed' : 'pointer' }}
                >
                    Reload from GitHub
                </button>
            </div>
        </div>
    );
}


