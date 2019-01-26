const {
  BaseKonnector,
  requestFactory,
  scrape,
  saveFiles,
  log,
  errors
} = require('cozy-konnector-libs')

const request = requestFactory({
  // the debug mode shows all the details about http request and responses. Very useful for
  // debugging but very verbose. That is why it is commented out by default
  // debug: true,
  // activates [cheerio](https://cheerio.js.org/) parsing on each page
  cheerio: true,
  // If cheerio is activated do not forget to deactivate json parsing (which is activated by
  // default in cozy-konnector-libs
  json: false,
  // this allows request-promise to keep cookies between requests
  jar: true
})

const baseUrl = 'http://administrateur-de-biens.immo/extranet/'
module.exports = new BaseKonnector(start)
var $;

// The start function is run by the BaseKonnector instance only when it got all the account
// information (fields). When you run this connector yourself in "standalone" mode or "dev" mode,
// the account information come from ./konnector-dev-config.json file
async function start(fields) {
  log('info', 'Authenticating ...')
  await authenticate(fields.login, fields.password, fields.syndic)

  log('info', 'Successfully logged in')
  // The BaseKonnector instance expects a Promise as return of the function
  log('info', 'Fetching the list of documents')
  $ = await request(`${baseUrl}accueil.php`)
  // cheerio (https://cheerio.js.org/) uses the same api as jQuery (http://jquery.com/)
  log('info', 'Parsing list of documents')
  const documents = await parseDocuments($, fields)

  // here we use the saveBills function even if what we fetch are not bills, but this is the most
  // common case in connectors
  log('info', 'Saving data to Cozy')
  await saveFiles(documents, fields, {
    timeout: Date.now() + 300 * 1000
  })
}

// this shows authentication using the [signin function](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_signin)
// even if this in another domain here, but it works as an example
async function authenticate(username, password, syndic) {
  // Recuperation du nom du syndic
  //construction de l'url
  var sURL = baseUrl + '?syndic=' + syndic
  //execution de la requete
  $ = await request(sURL)
  //parse pour recuperer le numero de client
  var sNumSyndic = $('#clt').attr('value')

  // les options de l'authentification
  var options = {
    method: 'POST',
    uri: 'http://administrateur-de-biens.immo/extranet/connexion.php',
    form: {
      // Like <input type="text" name="name">
      clt: sNumSyndic,
      login: username,
      password: password
    }
  }
  // Envoie la requete en post
  await request(options, function(err, response, body) {
    // La requete renvoie Success ou Failed (en chaine, en brut dans le body)
    if (body != 'Success') {
      throw new Error(errors.LOGIN_FAILED)
    }
  })
}

// The goal of this function is to parse a html page wrapped by a cheerio instance
// and return an array of js objects which will be saved to the cozy by saveBills (https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#savebills)
function parseDocuments($, fields) {
  // La structure de ce que l'on doit importer
  // <button class="accordion">2018</button>
  //   <div class="panel">
  //     <li>
  //       <a href="copro/280/NOUV/DOC_PROPRIETAIRE/Appel de Fonds 1er Trimestre 2019.PDF" target="_blank">
  //              Appel de Fonds 1er Trimestre 2019.PDF
  //       </a>
  //     </li>

  // on parcourt tous les li qui sont dans un div avec la classe .panel
  const docs = scrape(
    $,
    {
      // pour recuperer l'annee, il faut se positionner sur un lien (dans le LI, puis remonter)
      year: {
        sel: 'a',
        fn: $node =>
          $node
            .parent()
            .parent()
            .prev()
            .text()
      },
      title: {
        sel: 'a'
      },
      fileurl: {
        sel: 'a',
        attr: 'href',
        parse: src => `${baseUrl}/${src}`
      },
      filename: {
        sel: 'a'
      }
    },
    '.panel li'
  )

  log('info', 'nb documents : ' + docs.length)

  return docs.map(doc => ({
    ...doc,
    date: new Date(),
    annee: doc.year,
    vendor: fields.syndic,
    metadata: {
      importDate: new Date(),
      version: 1
    }
  }))
}
