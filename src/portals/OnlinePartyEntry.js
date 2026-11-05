// Managed matchmaking assigns a room for the whole Portals Party.
export function chooseOnlinePartyEntry({match=null,channel='',invite=''}={}){
 if(match?.managed===true)return Object.freeze({kind:'managed',privateRoom:match.visibility==='private'});
 if(typeof channel==='string'&&/^[a-z0-9][a-z0-9:_-]{0,63}$/i.test(channel))
  return Object.freeze({kind:'party',privateRoom:false});
 if(typeof invite==='string'&&/^CH[A-Z0-9]{8}$/.test(invite.toUpperCase().trim()))
  return Object.freeze({kind:'invite',code:invite.toUpperCase().trim(),privateRoom:true});
 return Object.freeze({kind:'manual'});
}
