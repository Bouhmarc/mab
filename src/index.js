const {
  CookieKonnector,
  requestFactory,
  signin,
  scrape,
  saveFiles,
  log,
  errors
} = require('cozy-konnector-libs')
const cheerio = require('cheerio')
const baseUrl = 'https://gimiweb.gimicloud.fr/'

class GimiWebKonnector extends CookieKonnector
{
  constructor (){
    super()
    this.request = requestFactory({
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
    this.documents = []


  }
  testSession() {
    log('info','testSession')
    return (this._jar.length > 0)
  }

  async fetch (fields)
  {
    log('info', "Authentication")
    await this.authenticate(fields.login, fields.password, fields.syndic)
   
    log('info','Parse documents')
    
    await this.parseDocuments()
    log('info','Nb de documents récupérés : ' + this.documents.length)

    // on parcourt les documents pour faire une requête HHTP pour récupérer le contenu de l'iframe  
    for (const oUnDoc of this.documents) {
      await this.changeURL(oUnDoc)
    }


    log('info', 'Saving files into cozy')
    await saveFiles(this.documents, fields, {
      timeout: Date.now() + 300 * 1000,
      validateFile: function() {return true;}
    })
  }

  async authenticate(username, password, syndic)
  {
    return signin({
      url: "https://gimiweb.gimicloud.fr/identity/" + syndic,
      formSelector: 'form',
      formData: {  "identifiant": username, "passwd": password, "get":syndic },
      // the validate function will check if
      validate: (statusCode, $) => {
        // detect logout button to know if signed in
        // 2 logout buttons: mobile and desktop
        
        if ($(`a[href='/identity/deconnexion']`).length > 0) {
          log('info','Connecté')
          return true
        } else {
          // cozy-konnector-libs has its own logging function which format these logs with colors in
          // standalone and dev mode and as JSON in production mode
          log('error', $('.error').text())
          throw new Error(errors.LOGIN_FAILED)
        }
      }
    })
  }

  async parseDocuments()
  {
      return await this.request("https://gimiweb.gimicloud.fr/documents", (function (error, response, body){
      
      var docs = []
      let $ = cheerio.load(body);
      docs = scrape($, 
        {
          id: 'td:nth-child(1)',
          name: {
            sel: 'td:nth-child(2)'
          },
          date: {
            sel:'td:nth-child(3)',
            parse: str => new Date(str)
          },
          fileurl: {
            sel: 'td:nth-child(4) a',
            attr: 'href',
            parse: href => `${baseUrl}${href}`
          }
        },
       
        '#tabledoc tbody tr'
      )

      log('info', 'Nombre de documents trouvés après scrape : ' + docs.length)

      //return docs;

      this.documents = docs.map(
        doc => ({
            ...doc,
            currency: '€',
            filename: doc.name + '.pdf',
            metadata: {
              // it can be interesting that we add the date of import. This is not mandatory but may be
              // usefull for debugging or data migration
              importDate: new Date(),
              // document version, usefull for migration after change of document structure
              version: 1 
            }
          }
      ))
      
    }).bind(this))
  }

  async changeURL(oUnDoc)
  {
    await this.request(oUnDoc.fileurl, (function (error, response, body){

          var $ = cheerio.load(body)
          // On récupère le lien vers l'iframe
          oUnDoc.fileurl = $('#frame2').attr('src')

        }))
  }

}



const connector = new GimiWebKonnector()

connector.run()