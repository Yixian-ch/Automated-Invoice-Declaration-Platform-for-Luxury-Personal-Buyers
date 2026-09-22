import { LegalPage, LegalH2 } from "@/components/legal-page";

export const metadata = { title: "Legal Notice — Ruichi" };

export default function LegalNoticePage() {
  return (
    <LegalPage title="Legal Notice">
      <p className="text-xs text-muted">Last updated: 22 September 2026</p>

      <LegalH2>1. Website Publisher</LegalH2>
      <p>
        The website https://ruichi.online (the &ldquo;Website&rdquo;) is published and operated by
        Ruichi (&ldquo;Ruichi&rdquo;). The particulars of the operating entity are set out below:
      </p>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          <strong>Operator</strong>: Ruichi
        </li>
        <li>
          <strong>Publication Manager</strong>: Ruichi
        </li>
        <li>
          <strong>Contact</strong>: contact@ruichi.online
        </li>
      </ul>
      <p className="text-xs text-muted">
        Note: the full particulars of the operating entity (registered name, company number,
        registered office and hosting provider) are to be completed by Ruichi&rsquo;s legal counsel
        before publication.
      </p>

      <LegalH2>2. Terms of Use</LegalH2>
      <p>
        Use of the Website implies full and unreserved acceptance of the terms set out in the
        &ldquo;Terms of Use&rdquo; page. These terms may be amended or supplemented at any time and
        Users are invited to consult them regularly. The Website is normally accessible at all
        times; however, Ruichi may decide to interrupt access for technical maintenance and will, so
        far as possible, give prior notice of such interruptions.
      </p>

      <LegalH2>3. Description of Services</LegalH2>
      <p>
        The Website provides information about Ruichi&rsquo;s activities and gives access to the
        invoice-declaration and commission-management platform intended for business-introduction
        partners. Ruichi endeavours to provide information that is as accurate as possible but shall
        not be liable for omissions, inaccuracies or failures to update, whether caused by Ruichi or
        by third-party partners who supply such information. All information is provided for guidance
        only and is subject to change.
      </p>

      <LegalH2>4. Technical Limitations</LegalH2>
      <p>
        The Website uses JavaScript technology. The Website shall not be held liable for any material
        damage arising from its use. You undertake to access the Website using up-to-date, virus-free
        equipment and a current-generation browser.
      </p>

      <LegalH2>5. Intellectual Property and Infringement</LegalH2>
      <p>
        Ruichi owns, or holds the rights to use, all intellectual property rights in all elements
        accessible on the Website, including text, images, graphics, logos, icons, sounds and
        software. Any reproduction, representation, modification, publication or adaptation of all or
        part of these elements, by whatever means, is prohibited without the prior written consent of
        Ruichi. Any unauthorised use of the Website or of any element it contains will be treated as
        infringement and pursued in accordance with the laws of the Hong Kong Special Administrative
        Region.
      </p>

      <LegalH2>6. Limitation of Liability</LegalH2>
      <p>
        Ruichi shall not be held liable for any direct or indirect damage caused to your equipment
        when accessing the Website, whether resulting from the use of equipment that does not meet the
        specifications set out in section 4 or from the appearance of a bug or incompatibility, nor
        for any indirect damage (such as loss of business or loss of opportunity) arising from use of
        the Website. Where interactive areas are made available, Ruichi reserves the right to remove,
        without prior notice, any content that contravenes applicable law, and to hold the relevant
        User civilly and/or criminally liable.
      </p>

      <LegalH2>7. Personal Data</LegalH2>
      <p>
        Personal data is processed in accordance with the Personal Data (Privacy) Ordinance (Cap.
        486) of Hong Kong. The manner in which personal data is collected, used and retained is
        described in the &ldquo;Privacy Policy&rdquo; and &ldquo;Data Protection&rdquo; pages. Ruichi
        is the data user responsible for the data collected on the Website.
      </p>

      <LegalH2>8. Hyperlinks and Cookies</LegalH2>
      <p>
        The Website may contain hyperlinks to other websites. Ruichi is unable to verify the content
        of the websites so visited and accepts no responsibility in this respect. Browsing the
        Website may cause cookies to be installed, in particular those necessary for authentication
        and the operation of the platform. Refusing to install a cookie may make certain services
        inaccessible. You may configure your browser to refuse the installation of cookies.
      </p>

      <LegalH2>9. Governing Law and Jurisdiction</LegalH2>
      <p>
        Any dispute in connection with the use of the Website is governed by the laws of the Hong
        Kong Special Administrative Region of the People&rsquo;s Republic of China, and exclusive
        jurisdiction is conferred on the courts of Hong Kong.
      </p>
    </LegalPage>
  );
}
