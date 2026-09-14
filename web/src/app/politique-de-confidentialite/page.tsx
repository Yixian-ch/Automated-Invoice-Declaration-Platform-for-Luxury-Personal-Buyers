import { LegalPage, LegalH2 } from "@/components/legal-page";

export const metadata = { title: "Politique de confidentialité — Ruichi" };

export default function PolitiqueDeConfidentialitePage() {
  return (
    <LegalPage title="Politique de confidentialité">
      <LegalH2>Qui sommes-nous ?</LegalH2>
      <p>L&rsquo;adresse de notre site est : http://www.luxeforguide.com.</p>

      <LegalH2>Utilisation des données personnelles collectées</LegalH2>

      <p className="font-medium text-ink">Commentaires</p>
      <p>
        Quand vous laissez un commentaire sur notre site, les données inscrites dans le formulaire
        de commentaire, ainsi que votre adresse IP et l&rsquo;agent utilisateur de votre navigateur
        sont collectés pour nous aider à la détection des commentaires indésirables.
      </p>
      <p>
        Une chaîne anonymisée créée à partir de votre adresse de messagerie (également appelée hash)
        peut être envoyée au service Gravatar pour vérifier si vous utilisez ce dernier. Après
        validation de votre commentaire, votre photo de profil sera visible publiquement à côté de
        votre commentaire.
      </p>

      <p className="font-medium text-ink">Médias</p>
      <p>
        Si vous téléversez des images sur le site, nous vous conseillons d&rsquo;éviter de
        téléverser des images contenant des données EXIF de coordonnées GPS. Les personnes visitant
        le site peuvent télécharger et extraire des données de localisation depuis ces images.
      </p>

      <p className="font-medium text-ink">Cookies</p>
      <p>
        Si vous déposez un commentaire sur le site, il vous sera proposé d&rsquo;enregistrer votre
        nom, votre adresse de messagerie et votre site dans des cookies. C&rsquo;est uniquement pour
        votre confort afin de ne pas avoir à saisir ces informations si vous déposez un autre
        commentaire plus tard. Ces cookies expirent au bout d&rsquo;un an.
      </p>
      <p>
        Si vous vous connectez, nous mettrons en place un certain nombre de cookies pour enregistrer
        vos informations de connexion et vos préférences d&rsquo;écran. La durée de vie d&rsquo;un
        cookie de connexion est de deux jours, celle d&rsquo;un cookie d&rsquo;option d&rsquo;écran
        est d&rsquo;un an. Si vous cochez « Se souvenir de moi », votre cookie de connexion sera
        conservé pendant deux semaines. Si vous vous déconnectez de votre compte, le cookie de
        connexion sera effacé.
      </p>
      <p>
        En modifiant ou en publiant une publication, un cookie supplémentaire sera enregistré dans
        votre navigateur. Ce cookie ne comprend aucune donnée personnelle ; il indique simplement
        l&rsquo;ID de la publication que vous venez de modifier et expire au bout d&rsquo;un jour.
      </p>

      <p className="font-medium text-ink">Contenu embarqué depuis d&rsquo;autres sites</p>
      <p>
        Les articles de ce site peuvent inclure des contenus intégrés (par exemple des vidéos,
        images, articles…). Le contenu intégré depuis d&rsquo;autres sites se comporte de la même
        manière que si le visiteur se rendait sur cet autre site. Ces sites web pourraient collecter
        des données sur vous, utiliser des cookies, embarquer des outils de suivi tiers et suivre
        vos interactions avec ces contenus embarqués si vous disposez d&rsquo;un compte connecté sur
        leur site web.
      </p>

      <LegalH2>Durées de stockage de vos données</LegalH2>
      <p>
        Si vous laissez un commentaire, le commentaire et ses métadonnées sont conservés
        indéfiniment. Cela permet de reconnaître et d&rsquo;approuver automatiquement les
        commentaires suivants au lieu de les laisser dans la file de modération. Pour les
        utilisateurs et utilisatrices qui s&rsquo;enregistrent sur le site, nous stockons également
        les données personnelles indiquées dans leur profil. Ils peuvent voir, modifier ou supprimer
        leurs informations personnelles à tout moment (à l&rsquo;exception de leur identifiant).
      </p>

      <LegalH2>Les droits que vous avez sur vos données</LegalH2>
      <p>
        Si vous avez un compte ou si vous avez laissé des commentaires sur le site, vous pouvez
        demander à recevoir un fichier contenant toutes les données personnelles que nous possédons
        à votre sujet, incluant celles que vous nous avez fournies. Vous pouvez également demander
        la suppression des données personnelles vous concernant. Cela ne prend pas en compte les
        données stockées à des fins administratives, légales ou pour des raisons de sécurité.
      </p>
    </LegalPage>
  );
}
