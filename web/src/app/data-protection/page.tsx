import { LegalPage, LegalH2, LegalWarning } from "@/components/legal-page";

export const metadata = { title: "Data Protection & Confidentiality — Ruichi" };

export default function DataProtectionPage() {
  return (
    <LegalPage title="Data Protection & Confidentiality">
      <p className="text-xs text-muted">Last updated: 22 September 2026</p>
      <p>
        This notice explains how Ruichi collects, uses, protects and discloses personal data, and
        sets out the confidentiality obligations that apply to all Data accessed through the
        Platform. It is issued in accordance with the Personal Data (Privacy) Ordinance (Cap. 486) of
        the Hong Kong Special Administrative Region (the &ldquo;PDPO&rdquo;).
      </p>

      <LegalH2>1. Processing of Your Personal Data</LegalH2>
      <p>
        Personal data collected on the Ruichi platform with your consent is processed for the
        following purposes:
      </p>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          the storage and validation of your supporting documents, enabling you to be listed as a
          business-introduction partner with the maisons, brands, chains and partner boutiques of
          Ruichi;
        </li>
        <li>
          the declaration and validation of your invoices and purchase receipts, and the calculation
          and tracking of the corresponding commissions.
        </li>
      </ul>
      <p>
        This processing is based on your consent. Providing the mandatory fields is necessary to
        enable Ruichi to manage and administer the validity of your files; without them, no
        validation can be carried out. Providing the other fields is optional. The processing is
        carried out under the responsibility of Ruichi, contactable at contact@ruichi.online.
      </p>

      <LegalH2>2. Categories of Data Collected</LegalH2>
      <p>
        The data collected includes the data required to verify your identity (name, email address,
        geographic address, telephone number, passport), your legal status as an independent or
        salaried business-introduction partner (business licence, certificate of incorporation and
        similar documents), your bank details where applicable, and the invoices and purchase
        receipts you declare on the Platform.
      </p>

      <LegalH2>3. Recipients of Your Personal Data</LegalH2>
      <p>The recipients of the data collected may be:</p>
      <p>
        <strong>3.1.</strong> the single maison, brand, chain or boutique that has sent you a
        specific invitation to register on its dedicated space on Ruichi, which will be the sole
        recipient of your personal data; or
      </p>
      <p>
        <strong>3.2.</strong> Ruichi together with those of its commercial partners with whom you
        have expressly consented to collaborate.
      </p>
      <p>
        The recipient(s) of your personal data will be expressly identified in the particular
        conditions to which you must consent upon registration.
      </p>

      <LegalH2>4. Confidentiality and Security of Your Data</LegalH2>
      <p>
        In order to preserve the confidentiality and security of your personal data, and in
        particular to protect it against unlawful or accidental destruction, accidental loss or
        alteration, or unauthorised disclosure or access, we implement appropriate technical and
        organisational measures, including: encryption of passwords, encrypted transport (HTTPS /
        SSL), role-based access control, logging of operations on personal data, and hosting of data
        within a secured environment. Your data is stored on secured personal spaces accessible only
        to the administrators of Ruichi and of its partner maisons, brands, chains or boutiques.
      </p>

      <LegalH2>5. Strict Prohibition on Disclosure of Data — Liability</LegalH2>
      <LegalWarning>
        <p className="font-medium text-ink">
          The public disclosure of Data is strictly prohibited. Violators will be held liable.
        </p>
        <p className="mt-2">
          All Data accessed through or obtained from the Platform — including personal data, partner
          data, client data, invoices, transaction records, pricing and commission rules — is
          confidential and is the property of Ruichi and/or its partners. No person may disclose,
          publish, disseminate, reproduce, transfer, sell or otherwise make such Data available to
          the public or to any third party, by any means or in any medium, whether during or after
          their use of the Platform, without the prior written consent of Ruichi.
        </p>
        <p className="mt-2">
          <strong>
            Any person who discloses Data in breach of this clause shall bear full legal liability.
          </strong>{" "}
          Ruichi reserves the right to suspend or terminate the offending account immediately, to
          report the matter to the competent authorities, and to pursue all civil and criminal
          remedies available under the laws of the Hong Kong Special Administrative Region, including
          injunctive relief, damages and an account of profits. The offending party shall indemnify
          Ruichi and its partners against all losses, liabilities, costs and expenses arising from
          the breach.
        </p>
      </LegalWarning>

      <LegalH2>6. Retention of Your Personal Data</LegalH2>
      <p>The data collected is retained for the following periods:</p>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          to validate your business-introduction partner file and your invoice declarations: five
          years from their validation, a period justified by the statutory retention requirements
          applicable in the event of an audit;
        </li>
        <li>
          where your data is used for commercial-communication purposes: two years from the
          collection of your most recent consent.
        </li>
      </ul>
      <p>Upon expiry of the periods above, the data is deleted, save where your consent is renewed.</p>

      <LegalH2>7. Your Rights</LegalH2>
      <p>
        In accordance with the PDPO, you have the right to request access to and correction of the
        personal data we hold about you, to be informed of the purposes for which your data is used,
        and to request that we cease using your data for direct-marketing purposes. You may also
        withdraw your consent to the processing of your data at any time; such withdrawal does not
        affect the lawfulness of processing carried out before the withdrawal.
      </p>
      <p>
        To exercise these rights, please contact us at contact@ruichi.online (subject: &ldquo;Data
        Protection — Ruichi&rdquo;). For confidentiality and security reasons, we may need to verify
        your identity before responding. If you consider that your rights have not been respected,
        you have the right to make a complaint to the Office of the Privacy Commissioner for Personal
        Data, Hong Kong (www.pcpd.org.hk).
      </p>
    </LegalPage>
  );
}
