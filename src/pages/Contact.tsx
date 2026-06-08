import { motion } from 'framer-motion';
import { ArrowUpRight, Mail, MessageSquareText, ShieldQuestion } from 'lucide-react';
import './Contact.css';

export default function Contact() {
  return (
    <motion.div
      className="page-transition-wrap contact-page container"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.22 }}
    >
      <section className="contact-wrapper">
        <div className="contact-brand">
          <span className="contact-eyebrow">Support</span>
          <h1>接入遇到问题时，把关键信息发过来。</h1>
          <p className="contact-subtitle">
            适用于 OAuth 客户端申请、redirect URI 配置、登录回调异常、scope 审核和一次性凭据读取问题。
          </p>
        </div>

        <div className="support-panel">
          <article className="support-card primary">
            <Mail size={20} />
            <div>
              <h2>邮件支持</h2>
              <p>support@nazo.run</p>
            </div>
            <a href="mailto:support@nazo.run" aria-label="发送邮件给 NazoAuth 支持">
              <ArrowUpRight size={18} />
            </a>
          </article>

          <article className="support-card">
            <ShieldQuestion size={20} />
            <div>
              <h2>申请接入</h2>
              <p>登录后在个人中心提交站点、回调地址和用途说明。</p>
            </div>
          </article>

          <article className="support-card">
            <MessageSquareText size={20} />
            <div>
              <h2>建议附带</h2>
              <p>client_id、redirect URI、请求时间、错误响应和浏览器控制台截图。</p>
            </div>
          </article>
        </div>
      </section>
    </motion.div>
  );
}
