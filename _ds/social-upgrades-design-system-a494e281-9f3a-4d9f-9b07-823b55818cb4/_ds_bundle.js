/* @ds-bundle: {"format":4,"namespace":"SocialUpgradesDesignSystem_a494e2","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Logo","sourcePath":"components/core/Logo.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Textarea","sourcePath":"components/forms/Input.jsx"},{"name":"CheckItem","sourcePath":"components/marketing/CheckList.jsx"},{"name":"CheckList","sourcePath":"components/marketing/CheckList.jsx"},{"name":"PlanCard","sourcePath":"components/marketing/PlanCard.jsx"},{"name":"SectionHeader","sourcePath":"components/marketing/SectionHeader.jsx"},{"name":"StepCard","sourcePath":"components/marketing/StepCard.jsx"},{"name":"Navbar","sourcePath":"components/navigation/Navbar.jsx"},{"name":"TickerBar","sourcePath":"components/navigation/TickerBar.jsx"}],"sourceHashes":{"components/core/Button.jsx":"3460af910b6c","components/core/Logo.jsx":"bb0aa31790d7","components/forms/Input.jsx":"3bd2ea007a6d","components/marketing/CheckList.jsx":"52ba8e399cb7","components/marketing/PlanCard.jsx":"442b225a721d","components/marketing/SectionHeader.jsx":"dfa8c86d8e56","components/marketing/StepCard.jsx":"defab3489eb9","components/navigation/Navbar.jsx":"5bbe55d767e7","components/navigation/TickerBar.jsx":"f05b00ae7dc4","ui_kits/website/Home.jsx":"69e755321634","ui_kits/website/PlanPage.jsx":"51062fa1d8c0","ui_kits/website/data.js":"8a9772dab686"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.SocialUpgradesDesignSystem_a494e2 = window.SocialUpgradesDesignSystem_a494e2 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Button.jsx
try { (() => {
const {
  useState
} = React;
function Button({
  variant = 'cta',
  size = 'md',
  children,
  href,
  onClick,
  style
}) {
  const [h, setH] = useState(false);
  const pad = {
    sm: '8px 18px',
    md: '12px 26px',
    lg: '15px 34px'
  }[size];
  const fs = {
    sm: 13,
    md: 15,
    lg: 16
  }[size];
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
    justifyContent: 'space-between',
    gap: 14,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontWeight: 500,
    fontSize: fs,
    textDecoration: 'none',
    transition: 'all var(--dur-fast) var(--ease-brand)',
    boxSizing: 'border-box'
  };
  const variants = {
    cta: {
      background: h ? '#000' : 'var(--cta-bg)',
      color: '#fff',
      borderRadius: 'var(--radius-pill)',
      padding: pad,
      width: '100%'
    },
    dark: {
      background: h ? '#000' : '#111',
      color: '#fff',
      borderRadius: 'var(--radius-btn-sq)',
      padding: pad,
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      justifyContent: 'center'
    },
    gradient: {
      background: 'var(--grad-brand)',
      color: '#fff',
      borderRadius: 'var(--radius-btn-sq)',
      padding: pad,
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      justifyContent: 'center',
      filter: h ? 'brightness(1.1)' : 'none'
    },
    'outline-dark': {
      background: h ? 'rgba(15,22,51,.06)' : 'transparent',
      color: 'var(--navy)',
      border: '1px solid var(--ink-40)',
      borderRadius: 'var(--radius-btn-sq)',
      padding: pad,
      justifyContent: 'center'
    },
    'outline-light': {
      background: h ? 'rgba(255,255,255,.12)' : 'transparent',
      color: '#fff',
      border: '1px solid rgba(255,255,255,.7)',
      borderRadius: 'var(--radius-btn-sq)',
      padding: pad,
      justifyContent: 'center'
    },
    'pill-light': {
      background: h ? 'rgba(255,255,255,.12)' : 'transparent',
      color: '#fff',
      border: '1px solid rgba(255,255,255,.7)',
      borderRadius: 'var(--radius-pill)',
      padding: pad,
      justifyContent: 'center'
    }
  };
  const Tag = href ? 'a' : 'button';
  const arrow = variant === 'cta' && /*#__PURE__*/React.createElement("span", {
    style: {
      width: fs + 11,
      height: fs + 11,
      minWidth: fs + 11,
      borderRadius: '50%',
      background: '#fff',
      color: '#111',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: fs - 2,
      transform: h ? 'rotate(45deg)' : 'none',
      transition: 'transform var(--dur-fast) var(--ease-brand)'
    }
  }, "\u2197");
  return /*#__PURE__*/React.createElement(Tag, {
    href: href,
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      ...base,
      ...variants[variant],
      ...style
    }
  }, children, arrow);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Logo.jsx
try { (() => {
function Logo({
  variant = 'full',
  wordmark = false,
  height = 40,
  stacked = false
}) {
  const srcs = {
    full: 'logo.svg',
    'mono-navy': 'logo-mono-navy.svg',
    'mono-white': 'logo-mono-white.svg',
    'on-dark': 'logo-on-dark.svg'
  };
  const base = typeof window !== 'undefined' && window.__DS_ASSET_BASE__ || 'assets/';
  const dark = variant === 'mono-white' || variant === 'on-dark';
  const img = /*#__PURE__*/React.createElement("img", {
    src: base + srcs[variant],
    alt: "Social Upgrades",
    style: {
      height,
      display: 'block'
    }
  });
  if (!wordmark) return img;
  const lockup = stacked ? dark ? 'lockup-stacked-cloud.png' : 'lockup-stacked.png' : dark ? 'lockup-oneline-cloud.png' : 'lockup-oneline.png';
  return /*#__PURE__*/React.createElement("img", {
    src: base + lockup,
    alt: "Social Upgrades",
    style: {
      height: height * (stacked ? 2.2 : 1.15),
      display: 'block'
    }
  });
}
Object.assign(__ds_scope, { Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Logo.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  label,
  textarea = false,
  style,
  ...rest
}) {
  const s = {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid var(--gray-200)',
    borderRadius: 'var(--radius-input)',
    background: '#fff',
    padding: '14px 16px',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    color: 'var(--navy)',
    outline: 'none',
    resize: 'vertical',
    ...style
  };
  const el = textarea ? /*#__PURE__*/React.createElement("textarea", _extends({
    rows: 4,
    style: s
  }, rest)) : /*#__PURE__*/React.createElement("input", _extends({
    style: s
  }, rest));
  if (!label) return el;
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      fontFamily: 'var(--font-body)',
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--text-muted)'
    }
  }, label, el);
}
function Textarea(props) {
  return /*#__PURE__*/React.createElement(Input, _extends({
    textarea: true
  }, props));
}
Object.assign(__ds_scope, { Input, Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/marketing/CheckList.jsx
try { (() => {
function CheckItem({
  children,
  nested = false,
  bold = false
}) {
  return /*#__PURE__*/React.createElement("li", {
    style: {
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
      marginLeft: nested ? 28 : 0,
      fontFamily: 'var(--font-body)',
      fontSize: 15,
      lineHeight: 1.5,
      color: 'var(--navy)',
      fontWeight: bold ? 600 : 400
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 15,
      height: 15,
      minWidth: 15,
      marginTop: 4,
      background: 'var(--check)',
      borderRadius: 3,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "7",
    viewBox: "0 0 9 7",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 3.5L3.4 6L8 1",
    stroke: "#fff",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("span", null, children));
}
function CheckList({
  items = [],
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: 'none',
      margin: 0,
      padding: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      ...style
    }
  }, items.map((it, i) => typeof it === 'string' ? /*#__PURE__*/React.createElement(CheckItem, {
    key: i
  }, it) : /*#__PURE__*/React.createElement(CheckItem, {
    key: i,
    nested: it.nested,
    bold: it.bold
  }, it.text)), children);
}
Object.assign(__ds_scope, { CheckItem, CheckList });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/CheckList.jsx", error: String((e && e.message) || e) }); }

// components/marketing/PlanCard.jsx
try { (() => {
function PlanCard({
  name,
  description,
  price,
  per = '/month',
  buyout,
  features = [],
  cta = 'Sign Up',
  onCta,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'transparent',
      padding: '40px 36px',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      fontFamily: 'var(--font-body)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 400,
      fontSize: 32,
      color: '#111',
      margin: 0
    }
  }, name), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 15,
      lineHeight: 1.7,
      color: 'var(--gray-600)',
      margin: '18px 0 26px'
    }
  }, description), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 400,
      fontSize: 56,
      color: '#111',
      letterSpacing: '-.02em'
    }
  }, price), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      color: '#111'
    }
  }, per)), buyout && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#111',
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontWeight: 600
    }
  }, "Buyout & handoff:"), " ", buyout), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '22px 0 30px'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    onClick: onCta
  }, cta)), /*#__PURE__*/React.createElement(__ds_scope.CheckList, {
    items: features
  }));
}
Object.assign(__ds_scope, { PlanCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/PlanCard.jsx", error: String((e && e.message) || e) }); }

// components/marketing/SectionHeader.jsx
try { (() => {
function SectionHeader({
  kicker,
  title,
  sub,
  dark = false,
  size = 'lg',
  style
}) {
  const fs = size === 'xl' ? 'clamp(56px,7vw,110px)' : size === 'lg' ? 'clamp(40px,5vw,72px)' : 'clamp(28px,3.5vw,44px)';
  return /*#__PURE__*/React.createElement("header", {
    style: {
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      alignItems: 'center',
      ...style
    }
  }, kicker && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 15,
      fontWeight: 400,
      color: dark ? '#fff' : 'var(--navy)'
    }
  }, kicker), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: fs,
      lineHeight: 1.02,
      letterSpacing: '-.01em',
      textTransform: 'uppercase',
      color: dark ? '#fff' : '#111',
      margin: 0
    }
  }, title), sub && /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 16,
      lineHeight: 1.7,
      maxWidth: 840,
      margin: 0,
      color: dark ? 'rgba(255,255,255,.85)' : 'var(--gray-600)'
    }
  }, sub));
}
Object.assign(__ds_scope, { SectionHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/SectionHeader.jsx", error: String((e && e.message) || e) }); }

// components/marketing/StepCard.jsx
try { (() => {
function StepCard({
  icon,
  title,
  children,
  angle = 135,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: `linear-gradient(${angle}deg,#1FB264 0%,#2E3FD6 100%)`,
      borderRadius: 'var(--radius-card)',
      padding: '48px 32px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      gap: 20,
      color: '#fff',
      fontFamily: 'var(--font-body)',
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      height: 120,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, typeof icon === 'string' ? /*#__PURE__*/React.createElement("img", {
    src: icon,
    alt: "",
    style: {
      maxHeight: 120
    }
  }) : icon), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 26,
      textTransform: 'uppercase',
      color: '#fff',
      margin: 0,
      letterSpacing: '.01em'
    }
  }, title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 16,
      lineHeight: 1.75,
      margin: 0,
      color: 'rgba(255,255,255,.95)'
    }
  }, children));
}
Object.assign(__ds_scope, { StepCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/StepCard.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Navbar.jsx
try { (() => {
const {
  useState
} = React;
function Navbar({
  items = ['E-Commerce', 'Websites', 'Website Chatbot', 'Marketing Strategy', 'Content Production'],
  active,
  onNav,
  transparent = false,
  style
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 32,
      padding: '22px 48px',
      background: transparent ? 'transparent' : 'var(--navy)',
      fontFamily: 'var(--font-body)',
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Logo, {
    variant: "on-dark",
    wordmark: true,
    height: 30
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 34
    }
  }, items.map(it => /*#__PURE__*/React.createElement(NavLink, {
    key: it,
    label: it,
    active: active === it,
    onClick: () => onNav && onNav(it)
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "pill-light",
    size: "sm",
    onClick: () => onNav && onNav('Login')
  }, "Login"), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "gradient",
    size: "sm",
    style: {
      borderRadius: 'var(--radius-pill)'
    },
    onClick: () => onNav && onNav('Book a Demo')
  }, "Book a Demo")));
}
function NavLink({
  label,
  active,
  onClick
}) {
  const [h, setH] = useState(false);
  return /*#__PURE__*/React.createElement("a", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      fontSize: 15,
      fontWeight: 400,
      color: h || active ? '#fff' : 'rgba(255,255,255,.82)',
      cursor: 'pointer',
      borderBottom: active ? '2px solid var(--green)' : '2px solid transparent',
      paddingBottom: 2
    }
  }, label);
}
Object.assign(__ds_scope, { Navbar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Navbar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TickerBar.jsx
try { (() => {
function TickerBar({
  text = 'Book Your FREE 15 Minute Consultation',
  href,
  speed = 28,
  style
}) {
  const item = /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 60,
      paddingRight: 60
    }
  }, /*#__PURE__*/React.createElement("span", null, text), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11
    }
  }, "\u2726"));
  return /*#__PURE__*/React.createElement("a", {
    href: href,
    style: {
      display: 'block',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      background: '#fff',
      color: '#111',
      fontFamily: 'var(--font-body)',
      fontSize: 15,
      padding: '10px 0',
      textDecoration: 'none',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      animation: `su-ticker ${speed}s linear infinite`
    }
  }, Array.from({
    length: 8
  }).map((_, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, item))), /*#__PURE__*/React.createElement("style", null, '@keyframes su-ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}'));
}
Object.assign(__ds_scope, { TickerBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TickerBar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Home.jsx
try { (() => {
function Home({
  go
}) {
  const {
    SectionHeader,
    StepCard,
    Button
  } = window.SocialUpgradesDesignSystem_a494e2;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'url(../../assets/poly-hero.png) center/cover',
      minHeight: 640,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '80px 24px 60px',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 900,
      fontSize: 'clamp(64px,10vw,150px)',
      lineHeight: .95,
      color: 'rgba(255,255,255,.92)',
      margin: 0,
      textTransform: 'uppercase',
      textShadow: '0 4px 30px rgba(15,22,51,.25)'
    }
  }, "Social", /*#__PURE__*/React.createElement("br", null), "Upgrades"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 'clamp(20px,2.6vw,36px)',
      letterSpacing: '.06em',
      color: 'rgba(255,255,255,.85)',
      marginTop: 18,
      textTransform: 'uppercase'
    }
  }, "Your Business. Upgraded."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      marginTop: 44
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "dark",
    size: "lg",
    onClick: () => go('Book a Demo'),
    style: {
      letterSpacing: '.08em',
      fontSize: 14
    }
  }, "BOOK A DEMO"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline-light",
    size: "lg",
    onClick: () => go('Websites'),
    style: {
      letterSpacing: '.08em',
      fontSize: 14
    }
  }, "SEE PLANS")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 16,
      left: 32,
      right: 32,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: '.08em',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("span", null, "BASED IN THE UNITED STATES"), /*#__PURE__*/React.createElement("span", {
    style: {
      maxWidth: 560,
      textAlign: 'center',
      fontFamily: 'var(--font-body)',
      fontWeight: 600
    }
  }, "WEBSITES, E-COMMERCE STORES, AI CHATBOTS, & MARKETING MANAGED MONTHLY. NO CONTRACTS & FAST TURNAROUND."), /*#__PURE__*/React.createElement("span", null, "BUILDING SINCE 2014"))), /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--navy)',
      padding: '90px 48px 110px'
    }
  }, /*#__PURE__*/React.createElement(SectionHeader, {
    dark: true,
    kicker: "A Better Way to Build",
    title: "How It Works",
    sub: "A streamlined workflow that keeps your business moving, without the agency back-and-forth"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 24,
      maxWidth: 1360,
      margin: '56px auto 0'
    }
  }, window.SU_DATA.steps.map((s, i) => /*#__PURE__*/React.createElement(StepCard, {
    key: s.title,
    title: s.title,
    angle: i % 2 ? 315 : 135,
    icon: /*#__PURE__*/React.createElement("img", {
      src: "../../assets/logo-mono-white.svg",
      style: {
        height: 72,
        opacity: .9
      },
      alt: ""
    })
  }, s.body)))));
}
window.SU_Home = Home;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Home.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/PlanPage.jsx
try { (() => {
function PlanPage({
  data
}) {
  const {
    SectionHeader,
    PlanCard,
    Input,
    Textarea,
    Button
  } = window.SocialUpgradesDesignSystem_a494e2;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--gray-100)',
      padding: '80px 0 100px'
    }
  }, /*#__PURE__*/React.createElement(SectionHeader, {
    kicker: data.kicker,
    title: data.title,
    sub: data.intro,
    size: "xl",
    style: {
      padding: '0 24px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1400,
      margin: '70px auto 0',
      border: '1px solid var(--border-hairline)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)'
    }
  }, data.plans.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: p.name,
    style: {
      borderLeft: i ? '1px solid var(--border-hairline)' : 'none'
    }
  }, /*#__PURE__*/React.createElement(PlanCard, p)))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid var(--border-hairline)',
      display: 'grid',
      gridTemplateColumns: '1fr 1.1fr',
      gap: 48,
      padding: '56px 40px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 400,
      fontSize: 34,
      color: '#111',
      margin: 0
    }
  }, data.custom.title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 15,
      lineHeight: 1.75,
      color: 'var(--navy)',
      margin: '20px 0 0',
      maxWidth: 520
    }
  }, data.custom.body), data.custom.reply && /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 15,
      margin: '16px 0 0',
      color: 'var(--navy)'
    }
  }, data.custom.reply), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      letterSpacing: '.04em',
      fontSize: 15,
      color: '#111',
      marginTop: 28
    }
  }, "PRICING VARIES")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      alignContent: 'start'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "Name"
  }), /*#__PURE__*/React.createElement(Input, {
    placeholder: "Email Address",
    type: "email"
  }), /*#__PURE__*/React.createElement(Input, {
    placeholder: "Current Website URL (if any)"
  }), /*#__PURE__*/React.createElement(Input, {
    placeholder: "Phone Number"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: '1 / -1'
    }
  }, /*#__PURE__*/React.createElement(Textarea, {
    placeholder: "Describe your goals, current channels, timeline, and what success looks like..."
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Button, {
    variant: "dark"
  }, "Request Quote"))))));
}
window.SU_PlanPage = PlanPage;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/PlanPage.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/data.js
try { (() => {
window.SU_DATA = {
  website: {
    kicker: 'No Contracts. Pause or Cancel Anytime.',
    title: 'Website Development',
    intro: 'We build and manage your website end to end, from design and development to hosting, updates, security, and ongoing edits. You get one monthly plan, a simple request queue, and steady progress without chasing freelancers or juggling vendors. Your site stays fast, secure, and current with ongoing improvements that keep it converting as your business evolves.',
    plans: [{
      name: 'Starter',
      price: '$299',
      buyout: '$2,999 or 12 months of service',
      description: 'A high-converting single page built to drive one action: book a call, request a quote, join, or buy. Perfect when you are running ads or you need something live fast.',
      features: ['1 high-converting landing page', 'Lead capture form & thank you page or redirect', 'Mobile-first design & basic on-page SEO', 'Google Analytics & Console setup', 'Managed hosting, SSL, backups, & security', '1 active request at a time', {
        text: '3–5 business day turnaround',
        nested: true
      }]
    }, {
      name: 'Growth',
      price: '$799',
      buyout: '$7,999 or 12 months of service',
      description: 'A complete multi-page website that details your operation and funnels visitors into leads. Built to grow with you through ongoing edits, new sections, and new pages as your business evolves.',
      features: ['Homepage with up to 10 additional pages', 'Lead capture form & thank you page or redirect', 'Mobile-first design & basic on-page SEO', 'Google Analytics & Console setup', 'Managed hosting, SSL, backups, & security', 'Blog or CMS setup', 'Premium forms or memberships', 'Ongoing edits and new sections', '1 active request at a time', {
        text: '2–3 business day turnaround',
        nested: true
      }]
    }, {
      name: 'Scale',
      price: '$1,499+',
      buyout: '$11,999+ or 12 months of service',
      description: 'A higher-volume website build with priority support and room for more pages, integrations, and continuous optimization. Best when your site is business-critical and you need faster turnaround plus more ongoing capacity.',
      features: ['Homepage with up to 25 additional pages', 'Lead capture form & thank you page or redirect', 'Mobile-first design & basic on-page SEO', 'Google Analytics & Console setup', 'Managed hosting, SSL, backups, & security', 'Blog or CMS setup', 'Premium forms or memberships', 'Ongoing edits and new sections', 'Integrations (CRM, booking, email flows) as needed', '2 active requests at a time', {
        text: 'Priority turnaround',
        nested: true
      }]
    }],
    custom: {
      title: 'Custom Work & One-Time Projects',
      body: 'Have something more specific in mind like a redesign, migration, or complex build? Send a quick overview and we\u2019ll come back with a clear plan and custom quote.',
      reply: 'We typically reply within 1–2 business days.'
    }
  },
  chatbot: {
    kicker: 'No Contracts. Pause or Cancel Anytime.',
    title: 'AI Support Chatbot',
    intro: 'We set up and manage a branded AI chatbot that captures customer data, reduces repetitive questions, improves response time, and turns chats into qualified inquiries. It\u2019s trained on your business content and continuously tuned using real customer conversations, with free installation available or a quick self-install option.',
    plans: [{
      name: 'Starter',
      price: '$99',
      description: 'A clean, branded AI agent chat widget that answers common questions instantly and captures leads. Runs fully automated with no human takeover.',
      features: ['Up to 100 messages per month', 'Captures customer data', 'Personalized bot with your branding', 'No human-interaction']
    }, {
      name: 'Growth',
      price: '$299',
      description: 'Your branded AI assistant handles day-to-day customer questions, qualifies leads, and will hand off to our team when necessary.',
      features: ['Up to 1,000 messages per month (overages $0.05/message)', 'Captures customer data', 'Personalized bot with your branding', 'Human takeover on request', 'Shopify Integration', 'Monthly report with commonly asked questions', 'Email & text support', {
        text: '+$99 per additional chatbot',
        bold: true
      }]
    }, {
      name: 'Scale',
      price: '$499',
      description: 'A higher-volume setup designed for teams that want the bot to do real work and surface actionable insights & high quality leads.',
      features: ['Up to 5,000 message completions (overages $0.04/message)', 'Captures customer data', 'Multiple Chatbots', 'Personalized bot with your brand', 'Human takeover on request', 'Shopify Integration', 'Monthly executive review session', 'Priority phone & email support', {
        text: '+$199 per additional chatbot',
        bold: true
      }]
    }],
    custom: {
      title: 'Custom Chatbots',
      body: 'Need something with more power or integrations? Let us know your needs and we\u2019ll develop a custom plan for you.',
      reply: ''
    }
  },
  steps: [{
    title: 'Subscribe',
    body: 'Pick a plan or inquire about a custom plan. Month to month, pause or cancel anytime.'
  }, {
    title: 'Submit',
    body: 'Send your request and priority. We confirm scope and start right away.'
  }, {
    title: 'Review & Launch',
    body: 'We ship in clean stages so you can approve fast, then we publish.'
  }, {
    title: 'Stay Updated',
    body: 'Hosting, fixes, updates, and ongoing improvements handled for you.'
  }]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.CheckItem = __ds_scope.CheckItem;

__ds_ns.CheckList = __ds_scope.CheckList;

__ds_ns.PlanCard = __ds_scope.PlanCard;

__ds_ns.SectionHeader = __ds_scope.SectionHeader;

__ds_ns.StepCard = __ds_scope.StepCard;

__ds_ns.Navbar = __ds_scope.Navbar;

__ds_ns.TickerBar = __ds_scope.TickerBar;

})();
