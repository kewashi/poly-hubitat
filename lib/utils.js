function curl_call(host, headertype, nvpstr, formdata, calltype, isjson) {
    var opts = {url: host, rejectUnauthorized: false};
    if ( !calltype ) {
        calltype = "GET";
    }
    opts.method = calltype;
    opts.json = isjson ? true : false;
    
    if ( nvpstr && typeof nvpstr === "object" ) {
        opts.form = nvpstr;
    } else if ( nvpstr && typeof nvpstr === "string" ) {
        opts.url = host + "?" + nvpstr;
    }
    if (formdata || formdata==="") {
        opts.formData = formdata;
    }
    if ( headertype ) {
        opts.headers = headertype;
    }
    return request(opts);
}


// trying to not use encoding
function encodeURI2(obj) {
    var str = JSON.stringify(obj)
    str = str.replace(/'/g,"");
    return str;
}

function decodeURI2(str) {
    if ( !str || typeof str !== "string" || str==="undefined" ) {
        return null;
    }
    var obj;
    try {
        obj = JSON.parse(str);
    } catch(e) {
        obj = null;
    }
    return obj;
}

function is_array(obj) {
    if ( typeof obj === "object" ) {
        return Array.isArray(obj);
    } else {
        return false;
    }
}

function is_object(obj) {
    return ( obj!==null && typeof obj === "object" );
}

function array_key_exists(key, arr) {
    if ( !is_object(arr) ) {
        return false;
    }
    return ( typeof arr[key] !== "undefined" );
}

function key_exists(key, arr) {
    return array_key_exists(key, arr);
}

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
