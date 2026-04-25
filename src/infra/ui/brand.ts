const OPENMETA_WORDMARK_LINES = String.raw`
                                                                                     
     _/_/                                  _/      _/              _/                
  _/    _/  _/_/_/      _/_/    _/_/_/    _/_/  _/_/    _/_/    _/_/_/_/    _/_/_/   
 _/    _/  _/    _/  _/_/_/_/  _/    _/  _/  _/  _/  _/_/_/_/    _/      _/    _/    
_/    _/  _/    _/  _/        _/    _/  _/      _/  _/          _/      _/    _/     
 _/_/    _/_/_/      _/_/_/  _/    _/  _/      _/    _/_/_/      _/_/    _/_/_/      
        _/                                                                           
       _/                                                                            
`.slice(1).trimEnd().split('\n');

export function getOpenMetaWordmarkLines(): string[] {
  return [...OPENMETA_WORDMARK_LINES];
}
