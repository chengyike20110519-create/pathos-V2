"use client";

import { useEffect, useMemo, useState } from "react";
import "./opportunities-preview.css";
import PageMotion from "@/components/shared/PageMotion";

type Opportunity = {
  school: string;
  mark: string;
  accent: string;
  eyebrow: string;
  title: string;
  description: string;
  audience: string;
  format: string;
  status: string;
  category: string;
  deadline: string;
  source: string;
  image: string;
};

const opportunities: Opportunity[] = [
  {
    school: "MIT",
    mark: "MIT",
    accent: "#a31f34",
    eyebrow: "MITES Summer",
    title: "让科学与工程，变成一次真正的大学体验。",
    description: "面向高中生的科学、工程和计算机项目，适合希望提前探索 STEM 学习路径的学生。",
    audience: "高中生",
    format: "暑期项目",
    status: "下一轮信息待发布",
    category: "暑期项目",
    deadline: "下一轮日期待发布",
    source: "https://mites.mit.edu/discover-mites/mites-summer/",
    image: "https://images.unsplash.com/photo-1564981797816-1043664bf78d?auto=format&fit=crop&w=1800&q=85",
  },
  {
    school: "Stanford",
    mark: "S",
    accent: "#8c1515",
    eyebrow: "Pre-Collegiate Summer Institutes",
    title: "在大学课堂里，开始下一段探索。",
    description: "围绕科学、人文、艺术和技术的大学预科课程。",
    audience: "中学生 / 高中生",
    format: "线上与线下课程",
    status: "下一轮信息待发布",
    category: "线上课程",
    deadline: "下一轮日期待发布",
    source: "https://summerinstitutes.stanford.edu/",
    image: "https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?auto=format&fit=crop&w=1600&q=85",
  },
  {
    school: "Harvard",
    mark: "H",
    accent: "#a51c30",
    eyebrow: "Harvard Pre-College Program",
    title: "把兴趣，带进真正的大学环境。",
    description: "让高中生体验大学课程、校园生活和跨学科探索。",
    audience: "高中生",
    format: "两周住校项目",
    status: "下一轮信息待发布",
    category: "暑期项目",
    deadline: "下一轮日期待发布",
    source: "https://summer.harvard.edu/high-school-programs/",
    image: "https://images.unsplash.com/photo-1606761568499-6d2451b23c66?auto=format&fit=crop&w=1600&q=85",
  },
  {
    school: "Yale",
    mark: "Y",
    accent: "#00356b",
    eyebrow: "Yale Summer Session",
    title: "用大学课程，验证你真正想学的方向。",
    description: "高中生可以了解 Yale Summer Session 的课程与申请路径。",
    audience: "高中生",
    format: "大学课程",
    status: "查看官方周期",
    category: "大学课程",
    deadline: "请查看官方周期",
    source: "https://summer.yale.edu/",
    image: "https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1600&q=85",
  },
  {
    school: "Princeton",
    mark: "P",
    accent: "#e77500",
    eyebrow: "Summer Journalism Program",
    title: "让真实的问题，成为你的第一篇报道。",
    description: "面向符合条件的高中生，探索新闻、写作和公共表达。",
    audience: "高中生",
    format: "暑期项目",
    status: "查看资格要求",
    category: "暑期项目",
    deadline: "请查看资格要求",
    source: "https://psjp.princeton.edu/",
    image: "https://images.unsplash.com/photo-1568792923760-d70635a89fdc?auto=format&fit=crop&w=1600&q=85",
  },
  {
    school: "Columbia",
    mark: "C",
    accent: "#1d365c",
    eyebrow: "High School Programs",
    title: "在纽约，提前开始你的大学学习。",
    description: "通过 Columbia 的高中项目了解大学课程和跨学科学习。",
    audience: "高中生",
    format: "线上与线下课程",
    status: "查看官方项目",
    category: "线上课程",
    deadline: "请查看官方项目",
    source: "https://precollege.sps.columbia.edu/",
    image: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1600&q=85",
  },
  {
    school: "UChicago",
    mark: "U",
    accent: "#800000",
    eyebrow: "Summer Session",
    title: "从一个问题出发，走得更深一点。",
    description: "了解 UChicago 面向高中生的大学课程和暑期学习机会。",
    audience: "高中生",
    format: "线上与线下课程",
    status: "查看官方周期",
    category: "线上课程",
    deadline: "请查看官方周期",
    source: "https://summer.uchicago.edu/",
    image: "https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1600&q=85",
  },
  {
    school: "Penn",
    mark: "P",
    accent: "#011f5b",
    eyebrow: "Pre-College Programs",
    title: "把课堂里的想法，带到现实世界。",
    description: "探索 Penn 的高中生预科课程、主题项目和学习路径。",
    audience: "高中生",
    format: "暑期课程",
    status: "查看官方项目",
    category: "大学课程",
    deadline: "请查看官方项目",
    source: "https://www.precollege.upenn.edu/",
    image: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1600&q=85",
  },
  {
    school: "Brown",
    mark: "B",
    accent: "#4e3629",
    eyebrow: "Brown Pre-College",
    title: "让好奇心，成为一门值得深入的课程。",
    description: "通过 Brown 的预科项目发现更加开放的学习方式。",
    audience: "高中生",
    format: "线上与线下课程",
    status: "下一轮信息待发布",
    category: "线上课程",
    deadline: "下一轮日期待发布",
    source: "https://precollege.brown.edu/",
    image: "https://images.unsplash.com/photo-1576495199011-eb94736d05d6?auto=format&fit=crop&w=1600&q=85",
  },
  {
    school: "Duke",
    mark: "D",
    accent: "#003087",
    eyebrow: "Duke Pre-College",
    title: "先试着走进一个你还不了解的领域。",
    description: "了解 Duke 面向高中生的课程型预科项目和申请安排。",
    audience: "高中生",
    format: "线上与线下课程",
    status: "关注下一轮开放",
    category: "暑期项目",
    deadline: "下一轮日期待发布",
    source: "https://precollege.duke.edu/",
    image: "https://images.unsplash.com/photo-1592280771190-3e2e4d571952?auto=format&fit=crop&w=1600&q=85",
  },
];

const categories = ["全部机会", "暑期项目", "大学课程", "线上课程"];

export default function OpportunitiesPreviewPage() {
  const [category, setCategory] = useState("全部机会");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [selected, setSelected] = useState<Opportunity | null>(null);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return opportunities.filter((item) => {
      const matchesCategory = category === "全部机会" || item.category === category;
      const matchesQuery = !normalizedQuery || `${item.school} ${item.eyebrow} ${item.title}`.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  useEffect(() => {
    const revealItems = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [category, query]);

  const toggleSaved = (school: string) => {
    setSaved((current) => current.includes(school) ? current.filter((item) => item !== school) : [...current, school]);
  };

  return (
    <PageMotion>
      <main className="opportunity-preview">
      <header className="preview-nav">
        <a className="preview-brand" href="#top" aria-label="PathOS 机会动态">
          <span className="preview-brand-mark">P</span>
          <span>PathOS</span>
        </a>
        <nav aria-label="机会动态导航">
          <a href="#featured">精选机会</a>
          <a href="#schools">探索学校</a>
          <a href="#why">工作方式</a>
        </nav>
        <a className="preview-nav-action" href="#schools">已收藏 {saved.length}</a>
      </header>

      <section className="preview-hero" id="top">
        <div className="hero-copy" data-reveal>
          <p className="preview-kicker">PathOS Opportunity Overview</p>
          <h1>机会动态</h1>
          <p className="preview-hero-copy">在重要课程和申请机会开放时，<br />及时知道下一步该做什么。</p>
          <a className="text-link" href="#featured">探索精选机会 <span aria-hidden="true">→</span></a>
        </div>
        <div className="hero-tool-preview" data-reveal aria-label="机会动态工具预览">
          <div className="hero-tool-topbar"><span className="hero-tool-dot" /><span>Opportunity feed</span><span className="hero-tool-count">10 universities</span></div>
          <div className="hero-tool-body">
            <div className="hero-tool-rail"><span className="hero-tool-rail-active" /><span /><span /><span /></div>
            <div className="hero-tool-list">
              {opportunities.slice(0, 3).map((item, index) => (
                <div className={`hero-tool-row hero-tool-row-${index}`} key={item.school}>
                  <span className="hero-tool-mark" style={{ backgroundColor: item.accent }}>{item.mark}</span>
                  <span className="hero-tool-row-copy"><strong>{item.school}</strong><small>{item.eyebrow}</small></span>
                  <span className="hero-tool-arrow">→</span>
                </div>
              ))}
            </div>
          </div>
          <div className="hero-tool-float"><span>新机会</span><strong>MITES Summer</strong><small>下一轮信息待发布</small></div>
        </div>
      </section>

      <section className="preview-feature" id="featured" data-reveal>
        <div className="feature-copy">
          <p className="preview-kicker">精选机会</p>
          <p className="feature-school">{opportunities[0].school}</p>
          <h2>{opportunities[0].title}</h2>
          <p>{opportunities[0].description}</p>
          <div className="feature-meta"><span>{opportunities[0].audience}</span><span>{opportunities[0].format}</span><span>{opportunities[0].status}</span></div>
          <div className="feature-actions">
            <button className="feature-save" onClick={() => toggleSaved(opportunities[0].school)} aria-pressed={saved.includes(opportunities[0].school)}><span aria-hidden="true">{saved.includes(opportunities[0].school) ? "★" : "☆"}</span>{saved.includes(opportunities[0].school) ? "已收藏" : "收藏机会"}</button>
            <a className="text-link text-link-light" href={opportunities[0].source} target="_blank" rel="noreferrer">查看 MIT 官方项目 <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <div className="feature-visual" style={{ backgroundImage: `url(${opportunities[0].image})` }}><div className="feature-visual-overlay" /><div className="feature-mark">{opportunities[0].mark}</div><span className="feature-visual-caption">MIT · Official opportunity</span></div>
      </section>

      <section className="preview-intro" id="schools" data-reveal>
        <p className="preview-kicker">Explore opportunities</p>
        <h2>从一所学校开始，找到适合你的下一步。</h2>
        <div className="tool-console">
          <label className="search-field"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索学校或项目" aria-label="搜索学校或项目" />{query ? <button onClick={() => setQuery("")} aria-label="清除搜索">×</button> : null}</label>
          <div className="category-switcher" role="tablist" aria-label="机会类型">
            {categories.map((item) => <button className={category === item ? "is-active" : ""} key={item} onClick={() => setCategory(item)} role="tab" aria-selected={category === item}>{item}</button>)}
          </div>
        </div>
        <p className="result-count">{filtered.length} 个机会{query ? ` · 搜索“${query}”` : ""}</p>
      </section>

      <section className="school-grid" aria-label="学校机会列表">
        {filtered.map((item, index) => (
          <article className={`school-panel ${index % 3 === 0 ? "school-panel-wide" : ""} ${saved.includes(item.school) ? "is-saved" : ""}`} key={item.school} data-reveal>
            <div className="school-panel-image" style={{ backgroundImage: `url(${item.image})` }}><div className="school-panel-shade" /><span className="school-mark" style={{ backgroundColor: item.accent }}>{item.mark}</span><span className="school-panel-label">{item.school}</span></div>
            <div className="school-panel-copy">
              <div className="school-panel-heading"><p>{item.eyebrow}</p><button className="school-save" onClick={() => toggleSaved(item.school)} aria-label={`${saved.includes(item.school) ? "取消收藏" : "收藏"} ${item.school}`} aria-pressed={saved.includes(item.school)}>{saved.includes(item.school) ? "★" : "☆"}</button></div>
              <h3>{item.title}</h3>
              <span className="school-panel-meta">{item.audience} · {item.format}</span>
              <span className="school-panel-status">{item.status}</span>
              <button className="panel-link" onClick={() => setSelected(item)}>了解更多 <span aria-hidden="true">→</span></button>
            </div>
          </article>
        ))}
      </section>

      <section className="preview-why" id="why" data-reveal>
        <div><p className="preview-kicker">Built for clearer decisions</p><h2>重要的不是看到更多机会，而是更早看懂一个机会。</h2></div>
        <div className="why-points"><div><strong>01</strong><span>官方来源</span><p>每条机会都连接到学校官方页面。</p></div><div><strong>02</strong><span>申请状态</span><p>区分开放、即将开放和下一轮待发布。</p></div><div><strong>03</strong><span>下一步</span><p>用清晰的条件和时间线帮助你行动。</p></div></div>
        <div className="timeline-line" aria-hidden="true"><span /><span /><span /></div>
      </section>

      <footer className="preview-footer"><span>PathOS</span><span>机会信息仅供参考，请以学校官方页面为准。</span><a href="#top">返回顶部 ↑</a></footer>

      {selected ? <div className="preview-modal-backdrop" role="presentation" onClick={() => setSelected(null)}><aside className="preview-modal" role="dialog" aria-modal="true" aria-label={`${selected.school} 机会详情`} onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelected(null)} aria-label="关闭详情">×</button><div className="modal-mark" style={{ backgroundColor: selected.accent }}>{selected.mark}</div><p className="preview-kicker">{selected.school}</p><h2>{selected.eyebrow}</h2><p>{selected.description}</p><dl className="modal-details"><div><dt>适合人群</dt><dd>{selected.audience}</dd></div><div><dt>项目形式</dt><dd>{selected.format}</dd></div><div><dt>当前状态</dt><dd>{selected.status}</dd></div><div><dt>申请时间</dt><dd>{selected.deadline}</dd></div></dl><div className="modal-actions"><button className="modal-save" onClick={() => toggleSaved(selected.school)}>{saved.includes(selected.school) ? "已收藏" : "收藏机会"}</button><a className="modal-action" href={selected.source} target="_blank" rel="noreferrer">前往官方来源 <span aria-hidden="true">↗</span></a></div></aside></div> : null}
    </main>
    </PageMotion>
  );
}
