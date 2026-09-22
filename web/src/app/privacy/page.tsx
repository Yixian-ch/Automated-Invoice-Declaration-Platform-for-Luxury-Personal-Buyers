import { LegalPage, LegalH2, LegalWarning } from "@/components/legal-page";

export const metadata = { title: "Privacy Policy — Ruichi" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p className="text-xs text-muted">Last updated: 22 September 2026</p>

      <LegalH2>Who We Are</LegalH2>
      <p>
        Ruichi is a digital platform that connects partner maisons and boutiques with their clients
        through an efficient and private channel. Our website address is https://ruichi.online. This
        Privacy Policy is issued in accordance with the Personal Data (Privacy) Ordinance (Cap. 486)
        of the Hong Kong Special Administrative Region.
      </p>

      <LegalH2>Personal Data We Collect</LegalH2>
      <p>In the course of your use of the Platform, we collect:</p>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          <strong>Account data</strong>: name, email address, telephone number, postal address, and
          password (stored in encrypted form);
        </li>
        <li>
          <strong>Supporting documents</strong>: identity documents (passport) and business
          documents (business licence) that you upload to your personal space;
        </li>
        <li>
          <strong>Activity data</strong>: the invoices and purchase receipts you declare, together
          with the information extracted from those documents for validation and commission
          calculation;
        </li>
        <li>
          <strong>Technical data</strong>: IP address and connection logs, for security and audit
          purposes.
        </li>
      </ul>

      <LegalH2>Purposes of Processing</LegalH2>
      <ul className="list-disc space-y-1 pl-6">
        <li>to create and manage your account and personal space;</li>
        <li>to validate your business-introduction partner file;</li>
        <li>to process your invoice declarations and calculate your commissions;</li>
        <li>to ensure the security of the Platform and prevent fraud;</li>
        <li>to respond to enquiries submitted through our contact channels.</li>
      </ul>

      <LegalH2>Cookies</LegalH2>
      <p>
        The Platform uses cookies that are strictly necessary for its operation, in particular to
        maintain your login session securely. These cookies are not used for advertising purposes.
        You may configure your browser to refuse them, which may however prevent access to your
        personal space.
      </p>

      <LegalH2>Disclosure of Your Data</LegalH2>
      <p>
        Your data is neither sold nor rented to third parties. It is accessible only to the
        administrators of Ruichi and, where applicable, to the partner maisons, brands, chains or
        boutiques with whom you have expressly consented to collaborate, in the manner described in
        the &ldquo;Data Protection &amp; Confidentiality&rdquo; page.
      </p>
      <LegalWarning>
        <p>
          The public disclosure of Data is strictly prohibited, and violators will be held liable.
          Any person who publishes or discloses to any third party the data accessed through the
          Platform, without Ruichi&rsquo;s prior written consent, bears full legal liability and will
          be pursued in accordance with the laws of the Hong Kong Special Administrative Region. See
          the &ldquo;Data Protection &amp; Confidentiality&rdquo; page for the full clause.
        </p>
      </LegalWarning>

      <LegalH2>Retention of Your Data</LegalH2>
      <p>
        The data in your file and your invoice declarations are retained for five years from their
        validation, in accordance with applicable statutory retention requirements. Data used for
        commercial-communication purposes is retained for two years from your most recent consent.
        Upon expiry of these periods, the data is deleted.
      </p>

      <LegalH2>Security</LegalH2>
      <p>
        We implement appropriate technical and organisational measures to protect your data,
        including encryption of passwords, encrypted transport (HTTPS), role-based access control,
        logging of operations, and hosting of data within a secured environment.
      </p>

      <LegalH2>Your Rights</LegalH2>
      <p>
        In accordance with the Personal Data (Privacy) Ordinance, you may request access to and
        correction of the personal data we hold about you, request that we cease using your data for
        direct marketing, and withdraw your consent at any time. This does not extend to data we are
        required to retain for administrative, legal or security reasons.
      </p>
      <p>
        To exercise these rights, contact us at contact@ruichi.online. You also have the right to
        lodge a complaint with the Office of the Privacy Commissioner for Personal Data, Hong Kong
        (www.pcpd.org.hk).
      </p>
    </LegalPage>
  );
}
