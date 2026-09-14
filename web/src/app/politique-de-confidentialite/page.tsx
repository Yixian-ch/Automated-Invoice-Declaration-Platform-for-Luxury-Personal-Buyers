import { LegalPage, LegalH2 } from "@/components/legal-page";

export const metadata = { title: "Politique de confidentialité — Ruichi" };

export default function PolitiqueDeConfidentialitePage() {
  return (
    <LegalPage title="Politique de confidentialité">
      <LegalH2>Qui sommes-nous ?</LegalH2>
      <p>
        Ruichi est une plateforme numérique mettant en relation les maisons et boutiques partenaires
        avec leurs clients à travers un canal efficace et privé. L&rsquo;adresse de notre site est :
        https://ruichi.online.
      </p>

      <LegalH2>Données personnelles collectées</LegalH2>
      <p>Dans le cadre de l&rsquo;utilisation de la plateforme, nous collectons :</p>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          <strong>Données de compte</strong> : nom, prénom, adresse électronique, téléphone, adresse
          postale, mot de passe (stocké sous forme chiffrée) ;
        </li>
        <li>
          <strong>Pièces justificatives</strong> : documents d&rsquo;identité (passeport) et
          documents professionnels (licence commerciale) que vous déposez volontairement sur votre
          espace personnel ;
        </li>
        <li>
          <strong>Données d&rsquo;activité</strong> : factures et tickets d&rsquo;achat déclarés,
          ainsi que les informations extraites de ces documents pour leur validation et le calcul
          des commissions ;
        </li>
        <li>
          <strong>Données techniques</strong> : adresse IP et journaux de connexion, à des fins de
          sécurité et d&rsquo;audit.
        </li>
      </ul>

      <LegalH2>Finalités du traitement</LegalH2>
      <p>Ces données sont traitées pour :</p>
      <ul className="list-disc space-y-1 pl-6">
        <li>créer et gérer votre compte et votre espace personnel ;</li>
        <li>valider votre dossier de partenaire apporteur d&rsquo;affaires ;</li>
        <li>traiter vos déclarations de factures et calculer vos commissions ;</li>
        <li>assurer la sécurité de la plateforme et prévenir la fraude ;</li>
        <li>répondre à vos demandes adressées via nos canaux de contact.</li>
      </ul>

      <LegalH2>Cookies</LegalH2>
      <p>
        La plateforme utilise des cookies strictement nécessaires à son fonctionnement, notamment
        pour maintenir votre session de connexion de manière sécurisée. Ces cookies ne sont pas
        utilisés à des fins publicitaires. Vous pouvez configurer votre navigateur pour les refuser,
        ce qui peut toutefois empêcher l&rsquo;accès à votre espace personnel.
      </p>

      <LegalH2>Partage de vos données</LegalH2>
      <p>
        Vos données ne sont ni vendues ni louées à des tiers. Elles ne sont accessibles
        qu&rsquo;aux administrateurs de Ruichi et, le cas échéant, aux maisons, marques, enseignes
        ou boutiques partenaires avec lesquelles vous avez expressément consenti à collaborer, dans
        les conditions décrites dans la page « RGPD – Confidentialité de l&rsquo;application
        Ruichi ».
      </p>

      <LegalH2>Durées de stockage de vos données</LegalH2>
      <p>
        Les données de votre dossier et vos déclarations de factures sont conservées cinq ans à
        compter de leur validation, conformément aux délais légaux applicables en cas de contrôle.
        Les données utilisées à des fins de communication commerciale sont conservées deux ans à
        compter de votre dernier consentement. À l&rsquo;expiration de ces périodes, les données
        sont effacées.
      </p>

      <LegalH2>Sécurité</LegalH2>
      <p>
        Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger
        vos données : chiffrement des mots de passe, échanges chiffrés (HTTPS), contrôle des accès
        par rôle, journalisation des opérations et hébergement des données dans l&rsquo;Union
        européenne.
      </p>

      <LegalH2>Les droits que vous avez sur vos données</LegalH2>
      <p>
        Conformément au règlement européen 2016/679 (RGPD) et à la loi « Informatique et Libertés »,
        vous pouvez demander à recevoir un fichier contenant toutes les données personnelles que
        nous possédons à votre sujet, incluant celles que vous nous avez fournies. Vous pouvez
        également demander la rectification ou la suppression des données personnelles vous
        concernant. Cela ne prend pas en compte les données que nous sommes tenus de conserver à des
        fins administratives, légales ou de sécurité.
      </p>
      <p>
        Pour exercer ces droits, contactez-nous à l&rsquo;adresse : contact@ruichi.online. Vous
        disposez également du droit d&rsquo;introduire une réclamation auprès de la CNIL
        (www.cnil.fr).
      </p>
    </LegalPage>
  );
}
