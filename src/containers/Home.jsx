import { useState, useEffect, useRef } from "react";
import { Typography, Fab } from "@mui/material";
import { ContentCopy, Check, ArticleOutlined, VideocamOutlined, CodeOutlined, RocketLaunchOutlined, SubjectOutlined, KeyboardArrowUp } from "@mui/icons-material";
import { useLocation, useNavigate } from "react-router-dom";
import routes from "../shared/routes";
import "./Home.css";

// ─── Fill these in when ready ────────────────────────────────────────────────
const PAPER_URL = "https://arxiv.org/abs/2510.06550";
const CODE_URL = "https://github.com/ucla-cdl/prior-weaver";
const VIDEO_EMBED_URL = "https://drive.google.com/file/d/1JnXuC6THiMhvP2n3VECw3fdXsSq5vt5D/preview";

const VENUE = "ACM CHI 2026";

const TITLE = "PriorWeaver: Prior Elicitation via Iterative Dataset Construction";

const AUTHORS = [
    { name: "Yuwei Xiao",       affil: [1], url: "https://xavier-shaw.github.io/", email: "yuweixiao@ucla.edu"       },
    { name: "Shuai Ma",         affil: [2], url: "https://shuaima.cc/",             email: "shuai.ma@aalto.fi"        },
    { name: "Antti Oulasvirta", affil: [2], url: "https://users.aalto.fi/~oulasvir/", email: "antti.oulasvirta@aalto.fi" },
    { name: "Eunice Jun",       affil: [1], url: "https://emjun.github.io/",        email: "emjun@cs.ucla.edu"        },
];

const AFFILIATIONS = [
    { id: 1, name: "UCLA" },
    { id: 2, name: "Aalto University" },
];

const ABSTRACT = `In Bayesian analysis, prior elicitation, or the process of facilitating the expression of one's beliefs to inform statistical modeling, is an essential yet challenging step.
Analysts often have beliefs about real-world variables and their relationships.
However, existing tools require analysts to translate these beliefs and express them indirectly as probability distributions over model parameters.
We present PriorWeaver, an interactive visualization system that facilitates prior elicitation through iterative dataset construction and refinement.
Analysts visually express their assumptions about individual variables and their relationships.
Under the hood, these assumptions create a dataset used to derive statistical priors.
Prior predictive checks then help analysts compare the priors to their assumptions.
In a lab study with 17 participants new to Bayesian analysis, we compare PriorWeaver to a baseline incorporating existing techniques.
Compared to the baseline, PriorWeaver gave participants greater control, clarity, and confidence, leading to priors that were better aligned with their expectations.`;

const BIBTEX =
    `@misc{xiao2026priorweaverpriorelicitationiterative,
      title={PriorWeaver: Prior Elicitation via Iterative Dataset Construction},
      author={Yuwei Xiao and Shuai Ma and Antti Oulasvirta and Eunice Jun},
      year={2026},
      eprint={2510.06550},
      archivePrefix={arXiv},
      primaryClass={cs.HC},
      url={https://arxiv.org/abs/2510.06550},
}`;

const CHIPS = [
    { label: "Paper",        href: PAPER_URL,       Icon: ArticleOutlined,      primary: false, external: true,  scrollTo: null            },
    { label: "Code",         href: CODE_URL,         Icon: CodeOutlined,         primary: false, external: true,  scrollTo: null            },
    { label: "Video",        href: null,             Icon: VideocamOutlined,     primary: false, external: false, scrollTo: "video-section"    },
    { label: "Abstract",     href: null,             Icon: SubjectOutlined,      primary: false, external: false, scrollTo: "abstract-section" },
    { label: "Try the Tool", href: null,             Icon: RocketLaunchOutlined, primary: true,  external: false, scrollTo: null, navigateTo: routes.workspace },
];
// ─────────────────────────────────────────────────────────────────────────────

const MONO = "'Space Mono', monospace";

const SECTION_HEADING_SX = {
    fontSize: '1.05rem', fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: '#111111', fontFamily: MONO, mb: '18px',
};

const supStr = (ids) => ids.join(",");

export default function Home() {
    const location = useLocation();
    const navigate = useNavigate();
    const [copied, setCopied] = useState(false);
    const [showTop, setShowTop] = useState(false);
    const copyTimeoutRef = useRef(null);

    useEffect(() => { document.title = "PriorWeaver"; }, []);

    useEffect(() => {
        const onScroll = () => setShowTop(window.scrollY > 300);
        window.addEventListener("scroll", onScroll);
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        if (sessionStorage.getItem("needReload")) {
            sessionStorage.removeItem("needReload");
            window.location.reload();
        }
    }, [location]);

    useEffect(() => () => clearTimeout(copyTimeoutRef.current), []);

    const handleCopy = () => {
        navigator.clipboard.writeText(BIBTEX);
        setCopied(true);
        clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="home">

            {/* ── Hero ─────────────────────────────────────────────────── */}
            <section className="hero-section" aria-labelledby="hero-title">
                <div className="content-container">
                    <Typography id="hero-title" component="h2" sx={{
                        fontSize: '2.6rem', fontWeight: 800, lineHeight: 1.2,
                        letterSpacing: '-0.01em', color: '#111111', mb: '20px', fontFamily: MONO,
                    }}>
                        {TITLE}
                    </Typography>

                    <div className="author-list">
                        {AUTHORS.map((a) => (
                            <div key={a.name} className="author-card">
                                <Typography
                                    component={a.url ? "a" : "span"}
                                    className={`author-name${a.url ? " author-link" : ""}`}
                                    {...(a.url && { href: a.url, target: "_blank", rel: "noopener noreferrer" })}
                                    sx={{ fontSize: '1.4rem', fontWeight: 500, color: '#111111', textDecoration: 'none', fontFamily: MONO }}
                                >
                                    {a.name}<sup>{supStr(a.affil)}</sup>
                                </Typography>
                                {a.email && (
                                    <Typography component="a" href={`mailto:${a.email}`}
                                        sx={{ fontSize: '0.9rem', color: '#555555', textDecoration: 'none', fontFamily: MONO, display: 'block' }}
                                        className="author-email">
                                        {a.email}
                                    </Typography>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="affiliation-list">
                        {AFFILIATIONS.map((af) => (
                            <Typography key={af.id} component="span"
                                sx={{ fontSize: '1.4rem', color: '#555555', m: 4, fontFamily: MONO }}>
                                <sup>{af.id}</sup>{af.name}
                            </Typography>
                        ))}
                    </div>

                    <div>
                        <Typography component="span" className="venue-text"
                            sx={{ fontSize: '1.3rem', fontFamily: MONO, color: '#111111' }}>
                            {VENUE}
                        </Typography>
                    </div>
                </div>
            </section>

            {/* ── Links ────────────────────────────────────────────────── */}
            <section className="links-section">
                <div className="content-container">
                    <div className="link-buttons">
                        {CHIPS.map(({ label, href, Icon, primary, external, scrollTo, navigateTo }) => (
                            (scrollTo || navigateTo) ? (
                                <button
                                    key={label}
                                    className={`hero-chip${primary ? " hero-chip--primary" : ""}`}
                                    onClick={() => scrollTo
                                        ? document.getElementById(scrollTo)?.scrollIntoView({ behavior: 'smooth' })
                                        : navigate(navigateTo)
                                    }
                                >
                                    <Icon className="hero-chip-icon" />
                                    <Typography component="span" sx={{ fontSize: '0.9rem', fontWeight: 500, fontFamily: MONO }}>
                                        {label}
                                    </Typography>
                                </button>
                            ) : (
                                <a
                                    key={label}
                                    className={`hero-chip${primary ? " hero-chip--primary" : ""}`}
                                    href={href}
                                    {...(external && { target: "_blank", rel: "noopener noreferrer" })}
                                >
                                    <Icon className="hero-chip-icon" />
                                    <Typography component="span" sx={{ fontSize: '0.9rem', fontWeight: 500, fontFamily: MONO }}>
                                        {label}
                                    </Typography>
                                </a>
                            )
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Teaser Figure ────────────────────────────────────────── */}
            <section className="teaser-section">
                <div className="content-container">
                    <img
                        src={process.env.PUBLIC_URL + "/teaser.png"}
                        alt="PriorWeaver teaser figure"
                        className="teaser-image"
                    />
                    <Typography className="teaser-caption" sx={{ fontFamily: MONO }}>
                        <strong>PriorWeaver</strong> supports prior elicitation and iteration through the construction of a dataset representative of
                        analysts' beliefs. <strong>(a)</strong> Analysts begin by considering their implicit domain knowledge about variable distributions (red), pairwise
                        relationships (blue), and multivariate relationships (yellow). <strong>(b)</strong> Analysts express these assumptions through coordinated
                        interactive visualizations, which simultaneously construct a representative dataset. <strong>(c)</strong> The dataset is used to derive statistical
                        priors by fitting a predefined model. <strong>(d)</strong> Prior predictive checks visualize the predicted distribution of the outcome variable,
                        which analysts can compare to their assumptions and use to iterate on their inputs.
                    </Typography>
                </div>
            </section>

            <hr className="section-divider" />

            {/* ── Teaser Video ─────────────────────────────────────────── */}
            <section id="video-section" className="video-section" aria-labelledby="video-heading">
                <div className="content-container">
                    <Typography id="video-heading" component="h2" sx={SECTION_HEADING_SX}>
                        Video
                    </Typography>
                    {VIDEO_EMBED_URL ? (
                        <div className="video-wrapper">
                            <iframe
                                src={VIDEO_EMBED_URL}
                                title="PriorWeaver video"
                                allowFullScreen
                                allow="autoplay; encrypted-media"
                            />
                        </div>
                    ) : (
                        <div className="video-placeholder">
                            <Typography sx={{ fontSize: '1rem', fontWeight: 500, color: '#555555', fontFamily: MONO }}>
                                Video coming soon
                            </Typography>
                        </div>
                    )}
                </div>
            </section>

            <hr className="section-divider" />

            {/* ── Abstract ─────────────────────────────────────────────── */}
            <section id="abstract-section" className="abstract-section" aria-labelledby="abstract-heading">
                <div className="content-container">
                    <Typography id="abstract-heading" component="h2" sx={SECTION_HEADING_SX}>
                        Abstract
                    </Typography>
                    <Typography sx={{ textAlign: 'justify', lineHeight: 1.8, fontSize: '1rem', color: '#111111', fontFamily: MONO }}>
                        {ABSTRACT}
                    </Typography>
                </div>
            </section>

            <hr className="section-divider" />

            {/* ── BibTeX ───────────────────────────────────────────────── */}
            <section className="bibtex-section" aria-labelledby="bibtex-heading">
                <div className="content-container">
                    <Typography id="bibtex-heading" component="h2" sx={SECTION_HEADING_SX}>
                        BibTeX
                    </Typography>
                    <div className="bibtex-block">
                        <button
                            className="copy-btn"
                            onClick={handleCopy}
                            aria-label={copied ? "Copied!" : "Copy BibTeX"}
                        >
                            {copied
                                ? <Check style={{ fontSize: 18, color: "#22c55e" }} />
                                : <ContentCopy style={{ fontSize: 18, color: "#f472b6" }} />
                            }
                        </button>
                        {BIBTEX}
                    </div>
                </div>
            </section>

            {/* ── Footer ───────────────────────────────────────────────── */}
            <footer className="site-footer">
                <div className="content-container">
                    <Typography sx={{ fontSize: '0.85rem', color: '#555555', fontFamily: MONO }}>
                        PriorWeaver &nbsp;·&nbsp; UCLA CDL &nbsp;·&nbsp; 2026
                    </Typography>
                </div>
            </footer>

            {/* ── Back to top ──────────────────────────────────────────── */}
            {showTop && (
                <Fab
                    aria-label="Back to top"
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    sx={{
                        position: 'fixed', bottom: 32, right: 32,
                        borderRadius: 0,
                        background: '#111111', color: '#ffffff',
                        border: '1.5px solid #111111',
                        boxShadow: '3px 3px 0 #f472b6',
                        transition: 'transform 0.1s, box-shadow 0.1s',
                        '&:hover': {
                            background: '#111111',
                            transform: 'translate(-1px, -1px)',
                            boxShadow: '4px 4px 0 #f472b6',
                        },
                    }}
                >
                    <KeyboardArrowUp />
                </Fab>
            )}

        </div>
    );
}
