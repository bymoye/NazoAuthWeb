import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-content">
        <div className="footer-brand">
          <img src="/icons/site-icon-64x64.png" alt="NazoAuth 图标" className="footer-logo" />
          <span>NazoAuth</span>
        </div>
        <div className="footer-links">
          <p className="footer-copyright">
            © {new Date().getFullYear()} NazoAuth. OAuth/OIDC account gateway.
          </p>
        </div>
      </div>
    </footer>
  );
}
